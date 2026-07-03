// Test d'intégration : demanderRenouvellement — fenêtre de 2 semaines avant
// la fin du stage, et la règle des 6 mois appliquée au cumul chaîne + durée
// demandée (pas seulement à la chaîne déjà terminée comme dans soumettreDemandeStage).
const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Direction, Service, Stage } = require('../../models');
const candidatService = require('../candidat.service');

const fauxFichier = { buffer: Buffer.from('pdf'), originalname: 'lettre.pdf', size: 3 };

const creerDirectionEtService = async () => {
  const direction = await Direction.create({ nom: 'Direction Test', accronyme: 'DT' });
  const service = await Service.create({ accronyme: 'SVC', description: 'Service test' });
  return { direction, service };
};

const isoDansNJours = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
};

const creerStageEnCours = (candidatId, direction, service, overrides = {}) => Stage.create({
  candidats_idcandidats: candidatId,
  typeStage: 'SOUTENANCE',
  domaineStage: 'Développement web',
  dureeStage: 2,
  // Par défaut commencé il y a 1 mois — laisse de la marge sous la limite de 6 mois
  // pour les tests qui ne portent pas spécifiquement sur le cumul de durée.
  dateDebutSouhaitee: isoDansNJours(-30),
  dateDebutEffective: isoDansNJours(-30),
  direction_iddirection: direction.iddirection,
  service_idservice: service.idservice,
  statusStage: 'EN_COURS',
  ...overrides,
});

describe('demanderRenouvellement', () => {
  beforeEach(async () => {
    await resetDb();
  });

  test('refuse si le stage n\'est pas EN_COURS', async () => {
    const candidat = await creerCandidat();
    const { direction, service } = await creerDirectionEtService();
    const stage = await creerStageEnCours(candidat.idcandidats, direction, service, {
      statusStage: 'TERMINE',
      dateFinEffective: isoDansNJours(5),
    });

    await expect(
      candidatService.demanderRenouvellement(candidat.idcandidats, stage.idstage, { dureeDemandee: 2 }, fauxFichier)
    ).rejects.toThrow('Le renouvellement n\'est possible que pour un stage en cours');
  });

  test('refuse plus de 2 semaines avant la fin du stage', async () => {
    const candidat = await creerCandidat();
    const { direction, service } = await creerDirectionEtService();
    const stage = await creerStageEnCours(candidat.idcandidats, direction, service, {
      dateFinEffective: isoDansNJours(30),
    });

    await expect(
      candidatService.demanderRenouvellement(candidat.idcandidats, stage.idstage, { dureeDemandee: 2 }, fauxFichier)
    ).rejects.toThrow('Le renouvellement sera disponible dans');
  });

  test('refuse si le stage est déjà terminé (date de fin dépassée d\'au moins un jour)', async () => {
    const candidat = await creerCandidat();
    const { direction, service } = await creerDirectionEtService();
    const stage = await creerStageEnCours(candidat.idcandidats, direction, service, {
      dateFinEffective: isoDansNJours(-1),
    });

    await expect(
      candidatService.demanderRenouvellement(candidat.idcandidats, stage.idstage, { dureeDemandee: 2 }, fauxFichier)
    ).rejects.toThrow('Le stage est déjà terminé');
  });

  test('accepte le renouvellement le dernier jour du stage (dateFinEffective = aujourd\'hui)', async () => {
    const candidat = await creerCandidat();
    const { direction, service } = await creerDirectionEtService();
    const stage = await creerStageEnCours(candidat.idcandidats, direction, service, {
      dureeStage: 2,
      dateFinEffective: isoDansNJours(0), // dernier jour actif
    });

    const result = await candidatService.demanderRenouvellement(
      candidat.idcandidats, stage.idstage, { dureeDemandee: 1 }, fauxFichier
    );

    expect(result.statusStage).toBe('EN_ATTENTE');
  });

  test('la dateDebutSouhaitee du renouvellement est le lendemain de la fin du stage actuel', async () => {
    const candidat = await creerCandidat();
    const { direction, service } = await creerDirectionEtService();
    const stage = await creerStageEnCours(candidat.idcandidats, direction, service, {
      dureeStage: 2,
      dateFinEffective: isoDansNJours(5),
    });

    const result = await candidatService.demanderRenouvellement(
      candidat.idcandidats, stage.idstage, { dureeDemandee: 1 }, fauxFichier
    );

    expect(result.dateDebutSouhaitee).toBe(isoDansNJours(6)); // lendemain de la fin
  });

  test('refuse sans lettre de demande', async () => {
    const candidat = await creerCandidat();
    const { direction, service } = await creerDirectionEtService();
    const stage = await creerStageEnCours(candidat.idcandidats, direction, service, {
      dateFinEffective: isoDansNJours(5),
    });

    await expect(
      candidatService.demanderRenouvellement(candidat.idcandidats, stage.idstage, { dureeDemandee: 2 }, null)
    ).rejects.toThrow('La lettre de demande de renouvellement est obligatoire');
  });

  test('accepte dans la fenêtre des 2 semaines et crée le stage de renouvellement', async () => {
    const candidat = await creerCandidat();
    const { direction, service } = await creerDirectionEtService();
    const stage = await creerStageEnCours(candidat.idcandidats, direction, service, {
      dureeStage: 2,
      dateFinEffective: isoDansNJours(5),
    });

    const result = await candidatService.demanderRenouvellement(
      candidat.idcandidats, stage.idstage, { dureeDemandee: 2 }, fauxFichier
    );

    expect(result.statusStage).toBe('EN_ATTENTE');
    const nouveauStage = await Stage.findByPk(result.idstage);
    expect(nouveauStage.estRenouvellement).toBe(1);
    expect(nouveauStage.stage_parent_idstage).toBe(stage.idstage);
  });

  test('refuse si le cumul chaîne + durée demandée dépasse 6 mois', async () => {
    const candidat = await creerCandidat();
    const { direction, service } = await creerDirectionEtService();
    // Stage en cours ayant déjà duré 5 mois (dateDebutEffective il y a 5 mois).
    const dateDebut = new Date();
    dateDebut.setMonth(dateDebut.getMonth() - 5);
    const stage = await creerStageEnCours(candidat.idcandidats, direction, service, {
      dateDebutEffective: dateDebut.toISOString().split('T')[0],
      dateFinEffective: isoDansNJours(5),
    });

    // Demander 3 mois de plus ferait 5 + 3 = 8 mois > 6.
    await expect(
      candidatService.demanderRenouvellement(candidat.idcandidats, stage.idstage, { dureeDemandee: 3 }, fauxFichier)
    ).rejects.toThrow('dépasserait la limite de 6 mois de stage continu');
  });

  test('refuse une seconde demande de renouvellement pour le même stage', async () => {
    const candidat = await creerCandidat();
    const { direction, service } = await creerDirectionEtService();
    const stage = await creerStageEnCours(candidat.idcandidats, direction, service, {
      dateFinEffective: isoDansNJours(5),
    });

    await candidatService.demanderRenouvellement(candidat.idcandidats, stage.idstage, { dureeDemandee: 1 }, fauxFichier);

    await expect(
      candidatService.demanderRenouvellement(candidat.idcandidats, stage.idstage, { dureeDemandee: 1 }, fauxFichier)
    ).rejects.toThrow('Une demande de renouvellement existe déjà pour ce stage');
  });
});
