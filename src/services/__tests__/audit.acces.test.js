// Audit du 2026-11-04 : lecture d'un dossier par son numéro.
// - fiche, pièces, convention et rapport d'un stage : candidat = les siens, agent = ses directions (avant : tout agent) ;
// - aide, offre et candidatures : candidat = les siennes, autres comptes = permission sur le module (avant : tout compte) ;
// - explorateur SQL de l'admin : lecture seule, secrets masqués (avant : toute requête).
jest.mock('../email.service');
jest.mock('../notification.service');
jest.mock('../../utils/fileStorage.util', () => ({
  saveFile: jest.fn(() => 'uploads/stages/fake.pdf'),
  readFile: jest.fn(() => Buffer.from('%PDF-fake')),
  deleteFile: jest.fn(),
}));

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Direction, Agent, Stage, DocumentStage, RapportStage, Role, Permission } = require('../../models');
const stageService = require('../stage.service');
const { buildDocumentStageAccess } = require('../../controllers/stage.controller');
const { authorizeCandidatOuModule, authorize } = require('../../middlewares/auth.middleware');
const aideController = require('../../controllers/aide.controller');
const offreController = require('../../controllers/offre.controller');
const aideService = require('../aide.service');
const offreService = require('../offre.service');
const { refuserRequete, masquerSecrets } = require('../../controllers/admin-db-explorer.controller');

const creerAgent = (directionId) => Agent.create({
  direction_iddirection: directionId,
  nom: 'Agent', prenom: 'Test',
  matricule: `MAT-${Date.now()}-${Math.random()}`,
  email: `agent.${Date.now()}.${Math.random()}@example.com`,
});

const creerRole = async ({ lectureGlobale = false, permissions = [] } = {}) => {
  const role = await Role.create({ accronyme: `R-${Date.now()}-${Math.random()}`, description: 'Rôle test', lectureGlobale });
  for (const [module, action] of permissions) await Permission.create({ role_idrole: role.idrole, module, action });
  return role;
};

const userAgent = (role, agent) => ({ role: role.accronyme, roles: [role.accronyme], roleIds: [role.idrole], agentId: agent.idagents });

describe('stages : fiche, pièces, convention, rapport', () => {
  let d1, d2, candidat, autreCandidat, stage, rapport;

  beforeEach(async () => {
    await resetDb();
    d1 = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    d2 = await Direction.create({ nom: 'D2', accronyme: 'D2' });
    candidat = await creerCandidat();
    autreCandidat = await creerCandidat();
    stage = await Stage.create({
      candidats_idcandidats: candidat.idcandidats, typeStage: 'SOUTENANCE', domaineStage: 'Web', dureeStage: 2,
      dateDebutSouhaitee: '2026-01-01', direction_iddirection: d1.iddirection, statusStage: 'EN_COURS',
      cnib_path: 'uploads/stages/cnib.pdf', cnib_filename: 'cnib.pdf',
    });
    await DocumentStage.create({
      stage_idstage: stage.idstage, typeDocument: 'CONVENTION', document_path: 'uploads/stages/conv.pdf',
      document_filename: 'convention.pdf', document_size: 9, dateEmission: '2026-01-01',
    });
    rapport = await RapportStage.create({
      stage_idstage: stage.idstage, titreRapport: 'Rapport', natureRapport: 'SOUTENANCE',
      rapportPdf_path: 'uploads/rapports/r.pdf', rapportPdf_filename: 'rapport.pdf',
    });
  });

  const lireTout = async (access) => {
    await stageService.getStageById(stage.idstage, access);
    await stageService.downloadStageDocument(stage.idstage, 'cnib', access);
    await stageService.downloadConventionStage(stage.idstage, access);
    await stageService.getRapportById(rapport.idrapport, access);
    await stageService.downloadRapport(rapport.idrapport, access);
  };
  const refuseTout = async (access) => {
    await expect(stageService.getStageById(stage.idstage, access)).rejects.toThrow('Stage non trouvé');
    await expect(stageService.downloadStageDocument(stage.idstage, 'cnib', access)).rejects.toThrow('Stage non trouvé');
    await expect(stageService.downloadConventionStage(stage.idstage, access)).rejects.toThrow('Convention de stage non trouvée');
    await expect(stageService.getRapportById(rapport.idrapport, access)).rejects.toThrow('Rapport non trouvé');
    await expect(stageService.downloadRapport(rapport.idrapport, access)).rejects.toThrow('Rapport non trouvé');
  };

  test('le candidat lit son stage, pas celui d\'un autre', async () => {
    await lireTout(await buildDocumentStageAccess({ role: 'CANDIDAT', roles: ['CANDIDAT'], roleIds: [1], candidatId: candidat.idcandidats }));
    await refuseTout(await buildDocumentStageAccess({ role: 'CANDIDAT', roles: ['CANDIDAT'], roleIds: [1], candidatId: autreCandidat.idcandidats }));
  });

  test('un agent de la direction du stage lit tout ; un agent d\'une autre direction rien', async () => {
    const role = await creerRole({ permissions: [['STAGE', 'CONSULTER']] });
    await lireTout(await buildDocumentStageAccess(userAgent(role, await creerAgent(d1.iddirection))));
    await refuseTout(await buildDocumentStageAccess(userAgent(role, await creerAgent(d2.iddirection))));
  });

  test('un agent sans permission STAGE ni RENOUVELLEMENT ne lit rien, même dans sa direction', async () => {
    const role = await creerRole({ permissions: [['OFFRE', 'CONSULTER']] });
    const access = await buildDocumentStageAccess(userAgent(role, await creerAgent(d1.iddirection)));
    expect(access).toBeNull();
    await refuseTout(access);
  });

  test('la permission RENOUVELLEMENT suffit, dans la direction', async () => {
    const role = await creerRole({ permissions: [['RENOUVELLEMENT', 'CONSULTER']] });
    await lireTout(await buildDocumentStageAccess(userAgent(role, await creerAgent(d1.iddirection))));
  });

  test('un rôle à lecture globale (RENOUVELLEMENT) et l\'admin lisent hors direction', async () => {
    const rh = await creerRole({ lectureGlobale: true, permissions: [['RENOUVELLEMENT', 'CONSULTER']] });
    await lireTout(await buildDocumentStageAccess(userAgent(rh, await creerAgent(d2.iddirection))));
    await lireTout(await buildDocumentStageAccess({ role: 'ADMIN', roles: ['ADMIN'], roleIds: [] }));
  });

  test('sans contexte d\'accès, rien n\'est lu', async () => {
    await refuseTout(undefined);
  });
});

describe('aides et offres : détail et candidature', () => {
  const reponse = () => {
    const res = { statusCode: 200, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
  };
  // Passe la requête par le middleware de la route puis par le contrôleur
  const appeler = async (module, controleur, user, id) => {
    const req = { user, params: { id } };
    const res = reponse();
    let suite = false;
    await authorizeCandidatOuModule(module)(req, res, () => { suite = true; });
    if (suite) await controleur(req, res);
    return res.statusCode;
  };

  beforeEach(() => jest.restoreAllMocks());

  test.each([
    ['AIDE', 'getAideById', aideController, aideService, 'getAideById'],
    ['AIDE', 'getCandidatureById', aideController, aideService, 'getCandidatureById'],
    ['OFFRE', 'getOffreById', offreController, offreService, 'getOffreById'],
    ['OFFRE', 'getCandidatureById', offreController, offreService, 'getCandidatureById'],
  ])('%s %s : propriétaire oui, autre candidat non, agent selon la permission', async (module, fn, ctrl, service, fnService) => {
    jest.spyOn(service, fnService).mockResolvedValue({ candidats_idcandidats: 7 });
    const candidat = (id) => ({ role: 'CANDIDAT', roles: ['CANDIDAT'], roleIds: [1], candidatId: id });

    expect(await appeler(module, ctrl[fn], candidat(7), 1)).toBe(200);
    expect(await appeler(module, ctrl[fn], candidat(8), 1)).toBe(404);

    await resetDb();
    const sansDroit = await creerRole({ permissions: [['STAGE', 'CONSULTER']] });
    const avecDroit = await creerRole({ permissions: [[module, 'CONSULTER']] });
    expect(await appeler(module, ctrl[fn], { role: sansDroit.accronyme, roles: [sansDroit.accronyme], roleIds: [sansDroit.idrole], agentId: 3 }, 1)).toBe(403);
    expect(await appeler(module, ctrl[fn], { role: avecDroit.accronyme, roles: [avecDroit.accronyme], roleIds: [avecDroit.idrole], agentId: 3 }, 1)).toBe(200);
    expect(await appeler(module, ctrl[fn], { role: 'ADMIN', roles: ['ADMIN'], roleIds: [], agentId: 3 }, 1)).toBe(200);
  });
});

describe('profil candidat : GET /candidat/stats', () => {
  test('compte ses demandes de stage, sans les renouvellements ni les demandes des autres', async () => {
    await resetDb();
    const candidatService = require('../candidat.service');
    const d = await Direction.create({ nom: 'D', accronyme: 'D' });
    const moi = await creerCandidat();
    const autre = await creerCandidat();
    const demande = (c, statusStage, parent = null) => Stage.create({
      candidats_idcandidats: c.idcandidats, typeStage: 'SOUTENANCE', domaineStage: 'Web', dureeStage: 2,
      dateDebutSouhaitee: '2026-01-01', direction_iddirection: d.iddirection, statusStage, stage_parent_idstage: parent,
    });
    const s1 = await demande(moi, 'EN_COURS');
    await demande(moi, 'EN_COURS_DE_TRAITEMENT');
    await demande(moi, 'REJETE');
    await demande(moi, 'ACCEPTE', s1.idstage);   // renouvellement : non compté
    await demande(autre, 'EN_ATTENTE');
    expect(await candidatService.getStatsCandidat(moi.idcandidats))
      .toEqual({ totalCandidatures: 3, candidaturesValidees: 1, candidaturesEnAttente: 1 });
  });
});

describe('authorize : plusieurs rôles', () => {
  test('authorize(\'ADMIN\', \'AGENT_RH\') laisse passer les deux rôles', () => {
    for (const role of ['ADMIN', 'AGENT_RH']) {
      const next = jest.fn();
      authorize('ADMIN', 'AGENT_RH')({ user: { role, roles: [role] } }, {}, next);
      expect(next).toHaveBeenCalled();
    }
  });
});

describe('explorateur SQL : lecture seule', () => {
  test.each([
    'SELECT * FROM stage', 'SELECT COUNT(*) FROM candidats WHERE del = 0;', 'SHOW TABLES', 'DESCRIBE stage',
    'EXPLAIN SELECT * FROM stage',
  ])('accepte : %s', (q) => expect(refuserRequete(q.replace(/;\s*$/, ''))).toBeNull());

  test.each([
    'UPDATE stage SET del = 1', 'DELETE FROM stage', 'DROP TABLE stage', 'TRUNCATE stage',
    'SELECT 1; DROP TABLE stage', 'SELECT * FROM stage /* x */', 'SELECT * FROM stage -- x',
    'SELECT * INTO OUTFILE \'/tmp/x\' FROM users', 'SELECT LOAD_FILE(\'/etc/passwd\')', 'SELECT SLEEP(10)',
    'SELECT password FROM users', 'SELECT * FROM stage FOR UPDATE',
  ])('refuse : %s', (q) => expect(refuserRequete(q)).not.toBeNull());

  test('les colonnes secrètes d\'un SELECT * sont masquées', () => {
    const [ligne] = masquerSecrets([{ idusers: 1, username: 'admin', password: '$2a$12$abc', resetToken: 'xyz' }]);
    expect(ligne).toEqual({ idusers: 1, username: 'admin', password: '••••••', resetToken: '••••••' });
  });
});
