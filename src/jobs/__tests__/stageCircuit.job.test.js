// Test d'intégration : circuit automatique d'une demande de stage.
//  - mise en traitement automatique une heure après le dépôt (stageStatusJob) ;
//  - relance hebdomadaire des agents sur les demandes bloquées (stageRelanceJob).
// E-mails et push navigateur simulés : les notifications in-app sont réellement écrites
// (elles servent de trace « déjà relancé »).
jest.mock('../../services/email.service');
jest.mock('../../services/push.service');

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const {
  Direction, Stage, Agent, User, Role, Permission, UserAgent, Notification,
} = require('../../models');
const emailService = require('../../services/email.service');
const pushService = require('../../services/push.service');
const { mettreEnTraitementDemandes } = require('../stageStatusJob');
const { runStageRelanceJob } = require('../stageRelanceJob');

const HEURE_MS = 60 * 60 * 1000;
const JOUR_MS = 24 * HEURE_MS;
const ilYa = (ms) => new Date(Date.now() - ms);

const creerStage = async (direction, overrides = {}) => {
  const candidat = await creerCandidat();
  return Stage.create({
    candidats_idcandidats: candidat.idcandidats,
    typeStage: 'SOUTENANCE',
    domaineStage: 'Génie informatique',
    dureeStage: 2,
    dateDebutSouhaitee: '2026-12-01',
    direction_iddirection: direction.iddirection,
    statusStage: 'EN_ATTENTE',
    ...overrides,
  });
};

/** Agent rattaché à une direction, avec un compte et un rôle portant les permissions STAGE données. */
const creerAgentAvecRole = async (direction, actions, { lectureGlobale = 0 } = {}) => {
  const role = await Role.create({ accronyme: `ROLE-${Math.random()}`, description: 'Rôle test', lectureGlobale });
  for (const action of actions) await Permission.create({ role_idrole: role.idrole, module: 'STAGE', action });
  const user = await User.create({ username: `agent.${Math.random()}`, password: 'motdepasse', role_idrole: role.idrole });
  const agent = await Agent.create({
    direction_iddirection: direction.iddirection,
    nom: 'Agent', prenom: 'Test',
    matricule: `MAT-${Math.random()}`,
    email: `agent.${Math.random()}@example.com`,
  });
  await UserAgent.create({ users_idusers: user.idusers, agents_idagents: agent.idagents });
  return agent;
};

describe('mettreEnTraitementDemandes (une heure après le dépôt)', () => {
  beforeEach(async () => {
    await resetDb();
    pushService.sendPushToUser.mockResolvedValue();
  });

  test('passe « En traitement » une demande déposée il y a plus d\'une heure', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const stage = await creerStage(direction, { createdDate: ilYa(2 * HEURE_MS) });

    expect(await mettreEnTraitementDemandes()).toBe(1);
    await stage.reload();
    expect(stage.statusStage).toBe('EN_COURS_DE_TRAITEMENT');
    expect(await Notification.count({ where: { recipient_type: 'CANDIDAT', type: 'STAGE_EN_TRAITEMENT' } })).toBe(1);
  });

  test('ne touche pas une demande de moins d\'une heure, ni un renouvellement, ni une re-soumission récente', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const recente = await creerStage(direction, { createdDate: ilYa(10 * 60 * 1000) });
    const parent = await creerStage(direction, { statusStage: 'EXPIRE', createdDate: ilYa(90 * JOUR_MS) });
    const renouvellement = await creerStage(direction, { stage_parent_idstage: parent.idstage, createdDate: ilYa(2 * HEURE_MS) });
    const resoumise = await creerStage(direction, { createdDate: ilYa(30 * JOUR_MS), dateResoumission: ilYa(10 * 60 * 1000) });

    expect(await mettreEnTraitementDemandes()).toBe(0);
    for (const s of [recente, renouvellement, resoumise]) {
      await s.reload();
      expect(s.statusStage).toBe('EN_ATTENTE');
    }
  });
});

describe('runStageRelanceJob (demandes bloquées depuis plus de 7 jours)', () => {
  beforeEach(async () => {
    await resetDb();
    emailService.sendEmail.mockClear();
    pushService.sendPushToUser.mockResolvedValue();
    emailService.buildBaseTemplate.mockImplementation((html) => html);
  });

  test('relance l\'approbateur de la direction et la RH (lecture globale), une seule fois par semaine', async () => {
    const d1 = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const d2 = await Direction.create({ nom: 'D2', accronyme: 'D2' });
    const d3 = await Direction.create({ nom: 'D3', accronyme: 'D3' });
    await creerStage(d1, { statusStage: 'EN_COURS_DE_TRAITEMENT', lastmodifiedDate: ilYa(10 * JOUR_MS) });
    await creerStage(d2, { statusStage: 'PROGRAMMATION_EN_COURS', lastmodifiedDate: ilYa(10 * JOUR_MS) });
    await creerStage(d1, { statusStage: 'EN_COURS_DE_TRAITEMENT', lastmodifiedDate: ilYa(2 * JOUR_MS) }); // trop récent

    const approbateurD1 = await creerAgentAvecRole(d1, ['CONSULTER', 'APPROUVER']);
    const approbateurD3 = await creerAgentAvecRole(d3, ['CONSULTER', 'APPROUVER']);
    const rh = await creerAgentAvecRole(d3, ['CONSULTER', 'VALIDER'], { lectureGlobale: 1 });

    expect(await runStageRelanceJob()).toBe(2);

    const relance = (agent) => Notification.findOne({ where: { recipient_type: 'AGENT', recipient_id: agent.idagents, type: 'RELANCE_STAGE' } });
    expect((await relance(approbateurD1)).message).toMatch(/^1 demande/);
    expect(await relance(approbateurD3)).toBeNull(); // aucune demande bloquée dans sa direction
    expect((await relance(rh)).message).toMatch(/^1 demande/); // programmation en D2 : la RH voit toutes les directions
    expect(emailService.sendEmail).toHaveBeenCalledTimes(2);

    // Deuxième passage dans la semaine : pas de nouvelle relance
    expect(await runStageRelanceJob()).toBe(0);
  });
});
