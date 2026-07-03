// Test d'intégration : règles métier de candidature à une aide sociale — même
// zone fragile que offre.service.js (prévention des doublons, plafond de
// bénéficiaires, statut de l'aide), entièrement portée par des requêtes DB.
jest.mock('../notification.service');

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Agent, Aide, CandidatureAide } = require('../../models');
const aideService = require('../aide.service');

const creerAgent = (overrides = {}) => Agent.create({
  nom: 'Agent',
  prenom: 'Test',
  matricule: `MAT-${Date.now()}-${Math.random()}`,
  email: `agent.${Date.now()}.${Math.random()}@example.com`,
  ...overrides,
});

const creerAideActive = async (overrides = {}) => {
  const agent = await creerAgent();
  return Aide.create({
    creePar: 'ADMIN',
    agents_idagents: agent.idagents,
    typeAide: 'FINANCIERE',
    titre: 'Aide de test',
    statusAide: 'ACTIVE',
    nombreBeneficiairesMax: 2,
    nombreBeneficiairesActuels: 0,
    ...overrides,
  });
};

describe('createCandidatureAide', () => {
  beforeEach(async () => {
    await resetDb();
  });

  test('une candidature valide est créée et incrémente le compteur de bénéficiaires', async () => {
    const aide = await creerAideActive();
    const candidat = await creerCandidat();

    const candidature = await aideService.createCandidatureAide(candidat.idcandidats, aide.idaide, {});

    expect(candidature.statusCandidature).toBe('SOUMISE');
    await aide.reload();
    expect(aide.nombreBeneficiairesActuels).toBe(1);
  });

  test('refuse une candidature sur une aide qui n\'est pas ACTIVE', async () => {
    const aide = await creerAideActive({ statusAide: 'EN_ATTENTE' });
    const candidat = await creerCandidat();

    await expect(
      aideService.createCandidatureAide(candidat.idcandidats, aide.idaide, {})
    ).rejects.toThrow('Aide non disponible pour candidature');
  });

  test('refuse une seconde candidature du même candidat à la même aide', async () => {
    const aide = await creerAideActive();
    const candidat = await creerCandidat();

    await aideService.createCandidatureAide(candidat.idcandidats, aide.idaide, {});

    await expect(
      aideService.createCandidatureAide(candidat.idcandidats, aide.idaide, {})
    ).rejects.toThrow('Vous avez déjà postulé à cette aide');

    const count = await CandidatureAide.count({ where: { aides_idaide: aide.idaide } });
    expect(count).toBe(1);
  });

  test('refuse une candidature une fois le plafond de bénéficiaires atteint', async () => {
    const aide = await creerAideActive({ nombreBeneficiairesMax: 1 });
    const candidatA = await creerCandidat();
    const candidatB = await creerCandidat();

    await aideService.createCandidatureAide(candidatA.idcandidats, aide.idaide, {});

    await expect(
      aideService.createCandidatureAide(candidatB.idcandidats, aide.idaide, {})
    ).rejects.toThrow('Le nombre maximum de bénéficiaires est atteint');
  });
});
