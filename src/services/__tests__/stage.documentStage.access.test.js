// Test d'intégration : IDOR sur GET /api/stages/documents/:id et /:id/download.
// Un candidat ne lit que les documents (convention / attestation) de ses propres stages ;
// un agent est cloisonné par direction sauf rôle système / lecture globale ; ADMIN global.
jest.mock('../email.service');
jest.mock('../notification.service');
jest.mock('../../utils/fileStorage.util', () => ({
  saveFile: jest.fn(() => 'uploads/documents-stage/fake-path.pdf'),
  readFile: jest.fn(() => Buffer.from('%PDF-fake')),
}));

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Direction, Agent, Stage, DocumentStage, Role, Permission } = require('../../models');
const stageService = require('../stage.service');
const { buildDocumentStageAccess } = require('../../controllers/stage.controller');

const creerAgent = (directionId) => Agent.create({
  direction_iddirection: directionId,
  nom: 'Agent', prenom: 'Test',
  matricule: `MAT-${Date.now()}-${Math.random()}`,
  email: `agent.${Date.now()}.${Math.random()}@example.com`,
});

const creerRole = async ({ lectureGlobale = false, permissions = [] } = {}) => {
  const role = await Role.create({
    accronyme: `R-${Date.now()}-${Math.random()}`,
    description: 'Rôle test',
    lectureGlobale,
  });
  for (const [module, action] of permissions) {
    await Permission.create({ role_idrole: role.idrole, module, action });
  }
  return role;
};

let direction1, direction2, candidat, autreCandidat, stage, document;

beforeEach(async () => {
  await resetDb();
  direction1 = await Direction.create({ nom: 'D1', accronyme: 'D1' });
  direction2 = await Direction.create({ nom: 'D2', accronyme: 'D2' });
  candidat = await creerCandidat();
  autreCandidat = await creerCandidat();
  stage = await Stage.create({
    candidats_idcandidats: candidat.idcandidats,
    typeStage: 'SOUTENANCE',
    domaineStage: 'Développement web',
    dureeStage: 2,
    dateDebutSouhaitee: '2026-01-01',
    direction_iddirection: direction1.iddirection,
    statusStage: 'EN_COURS',
  });
  document = await DocumentStage.create({
    stage_idstage: stage.idstage,
    typeDocument: 'CONVENTION',
    document_path: 'uploads/documents-stage/fake-path.pdf',
    document_filename: 'convention.pdf',
    document_size: 9,
    dateEmission: '2026-01-01',
  });
});

describe('service — accès aux documents_stage', () => {
  test('le candidat propriétaire peut lire et télécharger sa convention', async () => {
    const access = { candidatId: candidat.idcandidats };
    const doc = await stageService.getDocumentStageById(document.iddocument, access);
    expect(doc.iddocument).toBe(document.iddocument);
    const dl = await stageService.downloadDocumentStage(document.iddocument, access);
    expect(dl.filename).toBe('convention.pdf');
  });

  test('un autre candidat est refusé (IDOR) — masqué en "non trouvé"', async () => {
    const access = { candidatId: autreCandidat.idcandidats };
    await expect(stageService.getDocumentStageById(document.iddocument, access)).rejects.toThrow('Document non trouvé');
    await expect(stageService.downloadDocumentStage(document.iddocument, access)).rejects.toThrow('Document non trouvé');
  });

  test('un candidat sans candidatId est refusé', async () => {
    await expect(stageService.downloadDocumentStage(document.iddocument, { candidatId: null })).rejects.toThrow('Document non trouvé');
  });

  test('sans contexte d\'accès, le service refuse', async () => {
    await expect(stageService.downloadDocumentStage(document.iddocument)).rejects.toThrow('Document non trouvé');
    await expect(stageService.getDocumentStageById(document.iddocument)).rejects.toThrow('Document non trouvé');
  });

  test('un agent de la direction du stage peut télécharger', async () => {
    const agent = await creerAgent(direction1.iddirection);
    const dl = await stageService.downloadDocumentStage(document.iddocument, { agentContext: { agentId: agent.idagents, isSystemRole: false } });
    expect(dl.filename).toBe('convention.pdf');
  });

  test('un agent d\'une autre direction est refusé', async () => {
    const agent = await creerAgent(direction2.iddirection);
    const access = { agentContext: { agentId: agent.idagents, isSystemRole: false } };
    await expect(stageService.downloadDocumentStage(document.iddocument, access)).rejects.toThrow('Document non trouvé');
    await expect(stageService.getDocumentStageById(document.iddocument, access)).rejects.toThrow('Document non trouvé');
  });

  test('un agent rôle système / lecture globale accède hors direction', async () => {
    const agent = await creerAgent(direction2.iddirection);
    const dl = await stageService.downloadDocumentStage(document.iddocument, { agentContext: { agentId: agent.idagents, isSystemRole: true } });
    expect(dl.filename).toBe('convention.pdf');
  });
});

describe('controller — buildDocumentStageAccess', () => {
  test('ADMIN → accès global', async () => {
    const access = await buildDocumentStageAccess({ role: 'ADMIN', roles: ['ADMIN'], roleIds: [] });
    expect(access.agentContext.isSystemRole).toBe(true);
    const dl = await stageService.downloadDocumentStage(document.iddocument, access);
    expect(dl.filename).toBe('convention.pdf');
  });

  test('CANDIDAT → restreint à son candidatId', async () => {
    const access = await buildDocumentStageAccess({ role: 'CANDIDAT', roles: ['CANDIDAT'], roleIds: [1], candidatId: autreCandidat.idcandidats });
    expect(access).toEqual({ candidatId: autreCandidat.idcandidats });
    await expect(stageService.downloadDocumentStage(document.iddocument, access)).rejects.toThrow('Document non trouvé');
  });

  test('agent sans permission sur le module STAGE → null (403)', async () => {
    const role = await creerRole({ permissions: [['OFFRE', 'CONSULTER']] });
    const agent = await creerAgent(direction1.iddirection);
    const access = await buildDocumentStageAccess({ role: role.accronyme, roles: [role.accronyme], roleIds: [role.idrole], agentId: agent.idagents });
    expect(access).toBeNull();
  });

  test('agent avec STAGE → cloisonné à sa direction', async () => {
    const role = await creerRole({ permissions: [['STAGE', 'CONSULTER']] });
    const agentHors = await creerAgent(direction2.iddirection);
    const accessHors = await buildDocumentStageAccess({ role: role.accronyme, roles: [role.accronyme], roleIds: [role.idrole], agentId: agentHors.idagents });
    expect(accessHors.agentContext.isSystemRole).toBe(false);
    await expect(stageService.downloadDocumentStage(document.iddocument, accessHors)).rejects.toThrow('Document non trouvé');

    const agentDans = await creerAgent(direction1.iddirection);
    const accessDans = await buildDocumentStageAccess({ role: role.accronyme, roles: [role.accronyme], roleIds: [role.idrole], agentId: agentDans.idagents });
    const dl = await stageService.downloadDocumentStage(document.iddocument, accessDans);
    expect(dl.filename).toBe('convention.pdf');
  });

  test('agent avec rôle lecture globale (CONSULTER STAGE) → accès hors direction', async () => {
    const role = await creerRole({ lectureGlobale: true, permissions: [['STAGE', 'CONSULTER']] });
    const agent = await creerAgent(direction2.iddirection);
    const access = await buildDocumentStageAccess({ role: role.accronyme, roles: [role.accronyme], roleIds: [role.idrole], agentId: agent.idagents });
    expect(access.agentContext.isSystemRole).toBe(true);
    const dl = await stageService.downloadDocumentStage(document.iddocument, access);
    expect(dl.filename).toBe('convention.pdf');
  });

  test('utilisateur sans rôle → null', async () => {
    expect(await buildDocumentStageAccess({ roles: [], roleIds: [] })).toBeNull();
  });
});
