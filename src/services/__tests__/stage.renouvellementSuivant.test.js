// Renouvellement suivant de la chaîne : un stage ne se renouvelle qu'une fois ; la suite part
// du dernier renouvellement (autorisation de l'admin sur ce renouvellement, bouton du candidat
// sur sa carte).
jest.mock('../email.service');
jest.mock('../notification.service');
jest.mock('../inapp.service', () => ({ push: jest.fn() }));
jest.mock('../../utils/fileStorage.util', () => ({
  saveFile: jest.fn(() => 'uploads/test/fake.pdf'),
  readFile: jest.fn(() => Buffer.from('pdf')),
  deleteFile: jest.fn(),
}));

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Direction, Agent, Stage, RenouvellementStage, DocumentStage } = require('../../models');
const stageService = require('../stage.service');
const candidatService = require('../candidat.service');

const creerChaine = async () => {
  const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
  const candidat = await creerCandidat();
  const base = {
    candidats_idcandidats: candidat.idcandidats,
    typeStage: 'SOUTENANCE',
    domaineStage: 'Informatique',
    dureeStage: 2,
    dateDebutSouhaitee: '2026-01-01',
    direction_iddirection: direction.iddirection,
  };
  const racine = await Stage.create({ ...base, statusStage: 'EXPIRE', dateDebutEffective: '2026-01-01', dateFinEffective: '2026-02-28' });
  const renouvele = await Stage.create({
    ...base, dureeStage: 1, statusStage: 'EXPIRE', stage_parent_idstage: racine.idstage,
    dateDebutEffective: '2026-03-01', dateFinEffective: '2026-03-31',
  });
  await RenouvellementStage.create({
    stage_actuel_idstage: racine.idstage,
    stage_nouveau_idstage: renouvele.idstage,
    statusRenouvellement: 'EXPIRE',
    dureeDemandee: 1,
    dateRenouvellement: new Date('2026-02-20'),
  });
  return { candidat, racine, renouvele };
};

beforeEach(async () => {
  await resetDb();
});

describe('autoriserRenouvellementStage', () => {
  test('refuse un stage déjà renouvelé', async () => {
    const { racine } = await creerChaine();
    await expect(stageService.autoriserRenouvellementStage(racine.idstage, null))
      .rejects.toThrow(/déjà un renouvellement/);
  });

  test('accepte le dernier renouvellement de la chaîne, signalé dans la liste des renouvellements', async () => {
    const { renouvele } = await creerChaine();
    const admin = await Agent.create({ nom: 'Admin', prenom: 'Test', matricule: 'MAT-1', email: 'admin.test@example.com', direction_iddirection: renouvele.direction_iddirection });
    const autorisation = await stageService.autoriserRenouvellementStage(renouvele.idstage, admin.idagents);
    expect(autorisation.stage_idstage).toBe(renouvele.idstage);

    const { rows } = await stageService.getAllRenouvellements({});
    expect(rows).toHaveLength(1);
    expect(rows[0].stageNouveau.dejaRenouvele).toBe(false);
    expect(rows[0].stageNouveau.autorisationRenouvellement).toEqual(expect.objectContaining({ id: autorisation.id }));
  });
});

describe('getMesDemandesStage — dejaRenouvele', () => {
  test('la demande initiale est marquée renouvelée, pas le renouvellement', async () => {
    const { candidat, racine, renouvele } = await creerChaine();
    const items = await candidatService.getMesDemandesStage(candidat.idcandidats);
    const parId = Object.fromEntries(items.map(i => [i.idstage, i]));
    expect(parId[racine.idstage].dejaRenouvele).toBe(true);
    expect(parId[renouvele.idstage].dejaRenouvele).toBe(false);
    expect(parId[racine.idstage].chaine.dejaRenouvele).toBe(true);
  });
});

describe('2e renouvellement demandé par le candidat', () => {
  const isoDansNJours = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  };

  test('dernière semaine du renouvellement : bouton, lettre seule, convention du renouvellement reprise', async () => {
    const direction = await Direction.create({ nom: 'D1', accronyme: 'D1' });
    const candidat = await creerCandidat();
    const base = {
      candidats_idcandidats: candidat.idcandidats, typeStage: 'SOUTENANCE', domaineStage: 'Informatique',
      direction_iddirection: direction.iddirection, dateDebutSouhaitee: isoDansNJours(-60),
    };
    const racine = await Stage.create({ ...base, dureeStage: 1, statusStage: 'EXPIRE', dateDebutEffective: isoDansNJours(-60), dateFinEffective: isoDansNJours(-31) });
    const renouvele = await Stage.create({
      ...base, dureeStage: 1, statusStage: 'EN_COURS', stage_parent_idstage: racine.idstage,
      dateDebutEffective: isoDansNJours(-30), dateFinEffective: isoDansNJours(3),
    });
    await RenouvellementStage.create({
      stage_actuel_idstage: racine.idstage, stage_nouveau_idstage: renouvele.idstage,
      statusRenouvellement: 'EN_COURS', dureeDemandee: 1, dateRenouvellement: new Date(),
    });
    await DocumentStage.create({
      stage_idstage: renouvele.idstage, typeDocument: 'CONVENTION', document_path: 'uploads/conventions/renouvellements/c.pdf',
      document_filename: 'convention-renouvellement.pdf', document_size: 9, dateEmission: isoDansNJours(-31),
    });

    // La convention proposée au candidat est celle du renouvellement en cours
    const info = await candidatService.getConventionPourRenouvellement(candidat.idcandidats, renouvele.idstage);
    expect(info.convention.filename).toBe('convention-renouvellement.pdf');

    // Seule la lettre est fournie
    const lettre = { buffer: Buffer.from('pdf'), originalname: 'lettre.pdf', size: 3 };
    const cree = await candidatService.demanderRenouvellement(candidat.idcandidats, renouvele.idstage, { dureeDemandee: 1 }, lettre);
    expect(cree.stageParentId).toBe(renouvele.idstage);
    const nouveau = await Stage.findByPk(cree.idstage);
    expect(nouveau.direction_iddirection).toBe(direction.iddirection);
    expect(nouveau.dateDebutSouhaitee).toBe(isoDansNJours(4));

    // Le 1er renouvellement est désormais « déjà renouvelé » : plus de bouton sur sa carte
    const items = await candidatService.getMesDemandesStage(candidat.idcandidats);
    expect(items.find(i => i.idstage === renouvele.idstage).dejaRenouvele).toBe(true);
  });
});
