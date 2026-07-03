// Test d'intégration : règles métier de candidature à une offre — la zone la
// plus fragile de offre.service.js (prévention des doublons, plafond de
// candidatures, statut de l'offre), entièrement portée par des requêtes DB.
jest.mock('../notification.service');

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Agent, Offre, CandidatureOffre } = require('../../models');
const offreService = require('../offre.service');

const creerAgent = (overrides = {}) => Agent.create({
  nom: 'Agent',
  prenom: 'Test',
  matricule: `MAT-${Date.now()}-${Math.random()}`,
  email: `agent.${Date.now()}.${Math.random()}@example.com`,
  ...overrides,
});

const creerOffreActive = async (overrides = {}) => {
  const agent = await creerAgent();
  return Offre.create({
    creePar: 'ADMIN',
    agents_idagents: agent.idagents,
    typeOffre: 'EMPLOI',
    titre: 'Offre de test',
    statusOffre: 'ACTIVE',
    nombreCandidaturesMax: 2,
    nombreCandidaturesActuelles: 0,
    ...overrides,
  });
};

describe('createCandidatureOffre', () => {
  beforeEach(async () => {
    await resetDb();
  });

  test('une candidature valide est créée et incrémente le compteur de l\'offre', async () => {
    const offre = await creerOffreActive();
    const candidat = await creerCandidat();

    const candidature = await offreService.createCandidatureOffre(candidat.idcandidats, offre.idoffres, {});

    expect(candidature.statusCandidature).toBe('SOUMISE');
    await offre.reload();
    expect(offre.nombreCandidaturesActuelles).toBe(1);
  });

  test('refuse une candidature sur une offre qui n\'est pas ACTIVE', async () => {
    const offre = await creerOffreActive({ statusOffre: 'EN_ATTENTE' });
    const candidat = await creerCandidat();

    await expect(
      offreService.createCandidatureOffre(candidat.idcandidats, offre.idoffres, {})
    ).rejects.toThrow('Offre non disponible pour candidature');
  });

  test('refuse une candidature sur une offre créée par un candidat (pas ADMIN)', async () => {
    const candidatCreateur = await creerCandidat();
    const offre = await Offre.create({
      creePar: 'CANDIDAT',
      candidats_idcandidats: candidatCreateur.idcandidats,
      typeOffre: 'EMPLOI',
      titre: 'Offre candidat',
      statusOffre: 'ACTIVE',
      nombreCandidaturesMax: 2,
      nombreCandidaturesActuelles: 0,
    });
    const candidat = await creerCandidat();

    await expect(
      offreService.createCandidatureOffre(candidat.idcandidats, offre.idoffres, {})
    ).rejects.toThrow('Offre non disponible pour candidature');
  });

  test('refuse une seconde candidature du même candidat à la même offre', async () => {
    const offre = await creerOffreActive();
    const candidat = await creerCandidat();

    await offreService.createCandidatureOffre(candidat.idcandidats, offre.idoffres, {});

    await expect(
      offreService.createCandidatureOffre(candidat.idcandidats, offre.idoffres, {})
    ).rejects.toThrow('Vous avez déjà postulé à cette offre');

    // Une seule candidature doit exister en base, pas deux
    const count = await CandidatureOffre.count({ where: { offres_idoffres: offre.idoffres } });
    expect(count).toBe(1);
  });

  test('refuse une candidature une fois le plafond de candidatures atteint', async () => {
    const offre = await creerOffreActive({ nombreCandidaturesMax: 1 });
    const candidatA = await creerCandidat();
    const candidatB = await creerCandidat();

    await offreService.createCandidatureOffre(candidatA.idcandidats, offre.idoffres, {});

    await expect(
      offreService.createCandidatureOffre(candidatB.idcandidats, offre.idoffres, {})
    ).rejects.toThrow('Le nombre maximum de candidatures est atteint');
  });
});
