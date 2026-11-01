// Test d'intégration : evaluateRapport (cloisonnement par direction + bascule
// automatique du stage en TERMINE quand le rapport est validé) et
// createDocumentStage (une attestation exige un rapport VALIDE — c'est le bug
// corrigé aujourd'hui côté frontend : rapport_idrapport doit être fourni et
// pointer vers un rapport réellement validé, pas juste soumis).
jest.mock('../email.service');
jest.mock('../notification.service');
jest.mock('../../utils/fileStorage.util', () => ({
  saveFile: jest.fn(() => 'uploads/documents-stage/fake-path.pdf'),
  readFile: jest.fn(() => Buffer.from('pdf-sur-disque')),
}));

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Direction, Service, Agent, Stage, RapportStage, DocumentStage } = require('../../models');
const stageService = require('../stage.service');
const candidatService = require('../candidat.service');
const { createDocumentStageSchema } = require('../../validators/stage.validator');

const creerDirectionEtService = async () => {
  const direction = await Direction.create({ nom: 'Direction Test', accronyme: 'DT' });
  const service = await Service.create({ accronyme: 'SVC', description: 'Service test' });
  return { direction, service };
};

const creerAgent = (directionId, overrides = {}) => Agent.create({
  direction_iddirection: directionId,
  nom: 'Agent',
  prenom: 'Test',
  matricule: `MAT-${Date.now()}-${Math.random()}`,
  email: `agent.${Date.now()}.${Math.random()}@example.com`,
  ...overrides,
});

const creerStageAvecRapport = async (direction, service, statusStage = 'RAPPORT_SOUMIS') => {
  const candidat = await creerCandidat();
  const stage = await Stage.create({
    candidats_idcandidats: candidat.idcandidats,
    typeStage: 'SOUTENANCE',
    domaineStage: 'Développement web',
    dureeStage: 2,
    dateDebutSouhaitee: '2026-01-01',
    direction_iddirection: direction.iddirection,
    service_idservice: service.idservice,
    statusStage,
  });
  const rapport = await RapportStage.create({
    stage_idstage: stage.idstage,
    titreRapport: 'Mon rapport de stage',
    natureRapport: 'TECHNIQUE',
    rapportPdf: Buffer.from('pdf'),
    rapportPdf_filename: 'rapport.pdf',
    statusRapport: 'SOUMIS',
  });
  return { candidat, stage, rapport };
};

const fauxFichierAttestation = { buffer: Buffer.from('pdf'), originalname: 'attestation.pdf', size: 3 };

describe('evaluateRapport', () => {
  beforeEach(async () => {
    await resetDb();
  });

  test('valider le rapport fait passer le stage en TERMINE', async () => {
    const { direction, service } = await creerDirectionEtService();
    const { stage, rapport } = await creerStageAvecRapport(direction, service);
    const agent = await creerAgent(direction.iddirection);

    await stageService.evaluateRapport(
      rapport.idrapport,
      { statusRapport: 'VALIDE', noteRapport: 16 },
      agent.matricule,
      { isSystemRole: false, agentId: agent.idagents }
    );

    const stageMisAJour = await Stage.findByPk(stage.idstage);
    expect(stageMisAJour.statusStage).toBe('TERMINE');
  });

  test('refuser le rapport ne change pas le statut du stage', async () => {
    const { direction, service } = await creerDirectionEtService();
    const { stage, rapport } = await creerStageAvecRapport(direction, service);
    const agent = await creerAgent(direction.iddirection);

    await stageService.evaluateRapport(
      rapport.idrapport,
      { statusRapport: 'REFUSE', motifRefus: 'Incomplet' },
      agent.matricule,
      { isSystemRole: false, agentId: agent.idagents }
    );

    const stageMisAJour = await Stage.findByPk(stage.idstage);
    expect(stageMisAJour.statusStage).toBe('RAPPORT_SOUMIS');
  });

  test('un agent d\'une autre direction ne peut pas évaluer le rapport', async () => {
    const { direction, service } = await creerDirectionEtService();
    const autreDirection = await Direction.create({ nom: 'Autre Direction', accronyme: 'AD' });
    const { rapport } = await creerStageAvecRapport(direction, service);
    const agent = await creerAgent(autreDirection.iddirection);

    await expect(
      stageService.evaluateRapport(
        rapport.idrapport,
        { statusRapport: 'VALIDE' },
        agent.matricule,
        { isSystemRole: false, agentId: agent.idagents }
      )
    ).rejects.toThrow('ne relève pas de votre direction');
  });
});

describe('createDocumentStage — attestation', () => {
  beforeEach(async () => {
    await resetDb();
  });

  test('refuse une attestation si le rapport n\'est pas fourni', async () => {
    const { direction, service } = await creerDirectionEtService();
    const { stage } = await creerStageAvecRapport(direction, service, 'TERMINE');
    const agent = await creerAgent(direction.iddirection);

    await expect(
      stageService.createDocumentStage(agent.idagents, {
        stage_idstage: stage.idstage,
        typeDocument: 'ATTESTATION',
        dateEmission: '2026-06-01',
      }, fauxFichierAttestation)
    ).rejects.toThrow('Rapport non trouvé ou non validé');
  });

  test('refuse une attestation si le rapport n\'est que SOUMIS (pas encore validé)', async () => {
    const { direction, service } = await creerDirectionEtService();
    const { stage, rapport } = await creerStageAvecRapport(direction, service, 'RAPPORT_SOUMIS');
    const agent = await creerAgent(direction.iddirection);

    await expect(
      stageService.createDocumentStage(agent.idagents, {
        stage_idstage: stage.idstage,
        rapport_idrapport: rapport.idrapport,
        typeDocument: 'ATTESTATION',
        dateEmission: '2026-06-01',
      }, fauxFichierAttestation)
    ).rejects.toThrow('Rapport non trouvé ou non validé');
  });

  test('crée l\'attestation une fois le rapport VALIDE', async () => {
    const { direction, service } = await creerDirectionEtService();
    const { stage, rapport } = await creerStageAvecRapport(direction, service, 'TERMINE');
    await rapport.update({ statusRapport: 'VALIDE' });
    const agent = await creerAgent(direction.iddirection);

    const document = await stageService.createDocumentStage(agent.idagents, {
      stage_idstage: stage.idstage,
      rapport_idrapport: rapport.idrapport,
      typeDocument: 'ATTESTATION',
      dateEmission: '2026-06-01',
    }, fauxFichierAttestation);

    expect(document.typeDocument).toBe('ATTESTATION');
    const count = await DocumentStage.count({ where: { stage_idstage: stage.idstage, typeDocument: 'ATTESTATION' } });
    expect(count).toBe(1);
  });

  const preparerRapportValide = async () => {
    const { direction, service } = await creerDirectionEtService();
    const creation = await creerStageAvecRapport(direction, service, 'TERMINE');
    await creation.rapport.update({ statusRapport: 'VALIDE' });
    const attestation = {
      stage_idstage: creation.stage.idstage,
      rapport_idrapport: creation.rapport.idrapport,
      typeDocument: 'ATTESTATION',
      numeroAttestation: `N-${creation.rapport.idrapport}`,
      dateEmission: '2026-06-01',
    };
    return { ...creation, direction, service, attestation };
  };

  test('le serveur exige le numéro et la date envoyés par les écrans', () => {
    const base = { stage_idstage: 1, typeDocument: 'ATTESTATION', rapport_idrapport: 1 };

    expect(createDocumentStageSchema.validate(base).error).toBeDefined();
    expect(createDocumentStageSchema.validate({ ...base, dateEmission: '2026-06-01' }).error).toBeDefined();
    expect(createDocumentStageSchema.validate({
      ...base, dateEmission: '2026-06-01', numeroAttestation: '0125/SONABHY',
    }).error).toBeUndefined();
  });

  test('remplacer met à jour l\'attestation existante, même avec le même numéro', async () => {
    const { rapport, attestation } = await preparerRapportValide();

    const premiere = await stageService.createDocumentStage(null, attestation, fauxFichierAttestation);
    const seconde = await stageService.createDocumentStage(null, attestation, {
      ...fauxFichierAttestation, originalname: 'corrigee.pdf',
    });

    expect(seconde.iddocument).toBe(premiere.iddocument);
    const lignes = await DocumentStage.findAll({ where: { rapport_idrapport: rapport.idrapport } });
    expect(lignes).toHaveLength(1);
    expect(lignes[0].document_filename).toBe('corrigee.pdf');
  });

  test('refuse un numéro déjà utilisé par une autre attestation', async () => {
    const un = await preparerRapportValide();
    const deux = await preparerRapportValide();
    await stageService.createDocumentStage(null, un.attestation, fauxFichierAttestation);

    await expect(
      stageService.createDocumentStage(null, {
        ...deux.attestation, numeroAttestation: un.attestation.numeroAttestation,
      }, fauxFichierAttestation)
    ).rejects.toThrow('déjà utilisé');
  });

  test('refuse un rapport qui appartient à un autre stage', async () => {
    const un = await preparerRapportValide();
    const deux = await preparerRapportValide();

    await expect(
      stageService.createDocumentStage(null, {
        ...un.attestation, rapport_idrapport: deux.rapport.idrapport,
      }, fauxFichierAttestation)
    ).rejects.toThrow('Rapport non trouvé ou non validé');
  });

  test('un agent d\'une autre direction ne peut pas joindre l\'attestation', async () => {
    const { attestation } = await preparerRapportValide();
    const autreDirection = await Direction.create({ nom: 'Autre Direction', accronyme: 'AD' });
    const agent = await creerAgent(autreDirection.iddirection);

    await expect(
      stageService.createDocumentStage(agent.idagents, attestation, fauxFichierAttestation,
        { isSystemRole: false, agentId: agent.idagents })
    ).rejects.toThrow('ne relève pas de votre direction');
  });

  test('la liste des rapports indique l\'attestation jointe', async () => {
    const { rapport, attestation } = await preparerRapportValide();
    await stageService.createDocumentStage(null, attestation, fauxFichierAttestation);

    const rapports = await stageService.getAllRapports();
    const ligne = rapports.find(r => r.idrapport === rapport.idrapport);

    expect(ligne.attestations).toHaveLength(1);
    expect(ligne.attestations[0].numeroAttestation).toBe(attestation.numeroAttestation);
    expect(ligne.attestations[0].document).toBeUndefined();
  });

  test('le candidat télécharge son attestation stockée sur disque, pas celle d\'un autre', async () => {
    const proprietaire = await preparerRapportValide();
    const autre = await preparerRapportValide();
    const document = await stageService.createDocumentStage(null, proprietaire.attestation, fauxFichierAttestation);

    const fichier = await candidatService.getAttestationStage(proprietaire.candidat.idcandidats, document.iddocument);
    expect(fichier.data.toString()).toBe('pdf-sur-disque');

    await expect(
      candidatService.getAttestationStage(autre.candidat.idcandidats, document.iddocument)
    ).rejects.toThrow('Attestation non trouvée');
  });
});
