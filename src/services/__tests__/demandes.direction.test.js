// Offres, aides, audiences (2026-11-05) : direction choisie au dépôt, redirection seulement avant la décision,
// « En traitement » repart « En attente », un agent n'agit que sur les demandes de ses directions.
jest.mock('../notification.service');
jest.mock('../email.service');
jest.mock('../../utils/fileStorage.util', () => ({
  saveFile: jest.fn(() => 'uploads/offres/fake.pdf'),
  readFile: jest.fn(() => Buffer.from('%PDF-fake')),
  deleteFile: jest.fn(),
}));

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Direction, Agent, AgentDirection, Offre, Aide, DemandeAudience, Role } = require('../../models');
const offreService = require('../offre.service');
const aideService = require('../aide.service');
const audienceService = require('../demandeAudience.service');
const notifService = require('../notification.service');
const offreController = require('../../controllers/offre.controller');
const { createOffreCandidatSchema } = require('../../validators/offre.validator');
const { createAideCandidatSchema } = require('../../validators/aide.validator');

const fichiers = { cnib: [{ buffer: Buffer.from('x'), originalname: 'cnib.pdf', size: 1 }], demandeOffre: [{ buffer: Buffer.from('x'), originalname: 'd.pdf', size: 1 }] };

let d1, d2, candidat;
beforeEach(async () => {
  await resetDb();
  jest.clearAllMocks();
  notifService.onDemandeTransferee.mockResolvedValue();
  d1 = await Direction.create({ nom: 'D1', accronyme: 'D1' });
  d2 = await Direction.create({ nom: 'D2', accronyme: 'D2' });
  candidat = await creerCandidat({ ifu: '12345678A' });
});

const offre = (statusOffre, direction = d1) => Offre.create({
  creePar: 'CANDIDAT', candidats_idcandidats: candidat.idcandidats, typeOffre: 'SERVICE', titre: 'Offre',
  statusOffre, direction_iddirection: direction.iddirection,
});

describe('dépôt par le candidat : direction obligatoire', () => {
  test('le schéma refuse une offre ou une aide sans direction, et la garde (stripUnknown)', () => {
    for (const [schema, type] of [[createOffreCandidatSchema, 'typeOffre'], [createAideCandidatSchema, 'typeAide']]) {
      expect(schema.validate({ [type]: 'SERVICE', titre: 'T' }).error).toBeTruthy();
      const { error, value } = schema.validate({ [type]: 'SERVICE', titre: 'T', direction_iddirection: '3' });
      expect(error).toBeFalsy();
      expect(value.direction_iddirection).toBe(3);
    }
  });

  test('l\'offre est créée dans la direction choisie ; direction inconnue refusée', async () => {
    const o = await offreService.createOffreByCandidat(candidat.idcandidats, { typeOffre: 'SERVICE', titre: 'T', direction_iddirection: d2.iddirection }, fichiers);
    expect(o.direction_iddirection).toBe(d2.iddirection);
    await expect(offreService.createOffreByCandidat(candidat.idcandidats, { typeOffre: 'SERVICE', titre: 'T', direction_iddirection: 9999 }, fichiers))
      .rejects.toThrow('introuvable');
  });

  test('l\'aide est créée dans la direction choisie', async () => {
    const a = await aideService.createAideByCandidat(candidat.idcandidats, { typeAide: 'SOCIALE', titre: 'T', direction_iddirection: d1.iddirection },
      { cnib: fichiers.cnib, demandeAide: fichiers.demandeOffre });
    expect(a.direction_iddirection).toBe(d1.iddirection);
  });
});

describe('redirection', () => {
  test('offre En attente : redirigée, reste En attente, tracée, direction cible et candidat prévenus', async () => {
    const o = await offre('EN_ATTENTE');
    const r = await offreService.transfererOffre(o.idoffres, d2.iddirection, 7, 'agent.test');
    expect(r.direction_iddirection).toBe(d2.iddirection);
    expect(r.statusOffre).toBe('EN_ATTENTE');
    expect(r.transferePar).toBe('agent.test');
    expect(notifService.onDemandeTransferee).toHaveBeenCalledWith('OFFRE', expect.anything(), expect.objectContaining({ iddirection: d2.iddirection }));
  });

  test('offre En traitement : repart En attente pour la direction cible', async () => {
    const o = await offre('EN_TRAITEMENT');
    expect((await offreService.transfererOffre(o.idoffres, d2.iddirection)).statusOffre).toBe('EN_ATTENTE');
  });

  test.each(['VALIDEE', 'REJETEE', 'ACTIVE', 'CLOTUREE'])('offre %s : plus de redirection', async (statut) => {
    const o = await offre(statut);
    await expect(offreService.transfererOffre(o.idoffres, d2.iddirection)).rejects.toThrow('ne peut plus être redirigée');
  });

  test('aide validée : plus de redirection ; aide En traitement : repart En attente', async () => {
    const creer = (statusAide) => Aide.create({ creePar: 'CANDIDAT', candidats_idcandidats: candidat.idcandidats, typeAide: 'SOCIALE', titre: 'A', statusAide, direction_iddirection: d1.iddirection });
    await expect(aideService.transfererAide((await creer('VALIDEE')).idaide, d2.iddirection)).rejects.toThrow('ne peut plus être redirigée');
    const r = await aideService.transfererAide((await creer('EN_TRAITEMENT')).idaide, d2.iddirection);
    expect(r.statusAide).toBe('EN_ATTENTE');
  });

  test('audience : seulement En attente', async () => {
    const creer = (status) => DemandeAudience.create({ candidats_idcandidats: candidat.idcandidats, modeSoumission: 'FORMULAIRE', pourM: 'Directeur', dateAudience: '2026-12-01', heureAudience: '10:00', status, direction_iddirection: d1.iddirection });
    expect((await audienceService.transfererDemande((await creer('EN_ATTENTE')).iddemande, d2.iddirection)).direction_iddirection).toBe(d2.iddirection);
    await expect(audienceService.transfererDemande((await creer('ACCEPTE')).iddemande, d2.iddirection)).rejects.toThrow('ne peut plus être redirigée');
  });
});

describe('contrôleur : l\'agent n\'agit que dans ses directions', () => {
  const appeler = async (fn, user, params, body) => {
    const res = { statusCode: 200, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    await fn({ user, params, body, ip: '127.0.0.1' }, res);
    return res;
  };
  const agentDe = async (direction) => {
    const role = await Role.create({ accronyme: `R-${Math.random()}`, description: 'r' });
    const agent = await Agent.create({ nom: 'A', prenom: 'B', matricule: `M-${Math.random()}`, email: `a${Math.random()}@x.bf`, direction_iddirection: direction.iddirection });
    await AgentDirection.create({ agent_idagents: agent.idagents, direction_iddirection: direction.iddirection });
    return { role: role.accronyme, roles: [role.accronyme], roleIds: [role.idrole], agentId: agent.idagents, username: 'agent' };
  };

  test('agent d\'une autre direction : redirection et validation refusées ; agent de la direction : acceptées', async () => {
    const o = await offre('EN_ATTENTE', d1);
    const horsDirection = await agentDe(d2);
    expect((await appeler(offreController.transfererOffre, horsDirection, { id: o.idoffres }, { direction_iddirection: d2.iddirection })).statusCode).toBe(400);
    expect((await appeler(offreController.evaluateOffre, horsDirection, { id: o.idoffres }, { statusOffre: 'VALIDEE' })).statusCode).toBe(400);

    const dansDirection = await agentDe(d1);
    const r = await appeler(offreController.transfererOffre, dansDirection, { id: o.idoffres }, { direction_iddirection: d2.iddirection });
    expect(r.statusCode).toBe(200);
    expect(r.body.data.direction_iddirection).toBe(d2.iddirection);
  });

  test('l\'admin redirige partout', async () => {
    const o = await offre('EN_ATTENTE', d1);
    const r = await appeler(offreController.transfererOffre, { role: 'ADMIN', roles: ['ADMIN'], roleIds: [], agentId: null, username: 'admin' }, { id: o.idoffres }, { direction_iddirection: d2.iddirection });
    expect(r.statusCode).toBe(200);
  });
});
