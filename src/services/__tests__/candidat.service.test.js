// Test d'intégration : soumission d'une demande de stage par un candidat — la
// règle la plus fragile de candidat.service.js, à l'intersection de plusieurs
// vérifications (stage actif existant, fichiers obligatoires, et surtout la
// règle des 6 mois continus qui remonte une vraie chaîne de stages en base).
jest.mock('../email.service');
jest.mock('../notification.service');
jest.mock('../../utils/fileStorage.util', () => ({
  saveFile: jest.fn(() => 'uploads/stages/fake-path.pdf'),
}));

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { Direction, Service, Stage } = require('../../models');
const candidatService = require('../candidat.service');

const fauxFichier = (nom) => ({ buffer: Buffer.from('pdf'), originalname: `${nom}.pdf`, size: 3 });

const fichiersComplets = () => ({
  cv: fauxFichier('cv'),
  cnib: fauxFichier('cnib'),
  casierJudiciaire: fauxFichier('casier'),
  lettreMotivation: fauxFichier('motivation'),
  lettreRecommandation: fauxFichier('recommandation'),
  dernierDiplome: fauxFichier('diplome'),
});

const creerDirectionEtService = async () => {
  const direction = await Direction.create({ nom: 'Direction Test', accronyme: 'DT' });
  const service = await Service.create({ accronyme: 'SVC', description: 'Service test' });
  return { direction, service };
};

const demandeValide = (direction, service, overrides = {}) => ({
  typeStage: 'SOUTENANCE',
  niveau: 'LICENCE',
  domaineStage: 'Développement web',
  direction_iddirection: direction.iddirection,
  service_idservice: service.idservice,
  dureeStage: 2,
  dateDebutSouhaitee: '2026-09-01',
  ...overrides,
});

describe('soumettreDemandeStage', () => {
  beforeEach(async () => {
    await resetDb();
  });

  test('crée la demande quand tout est valide', async () => {
    const candidat = await creerCandidat();
    const { direction, service } = await creerDirectionEtService();

    const result = await candidatService.soumettreDemandeStage(
      candidat.idcandidats,
      demandeValide(direction, service),
      fichiersComplets()
    );

    expect(result.statusStage).toBe('EN_ATTENTE');
    const stageEnBase = await Stage.findByPk(result.idstage);
    expect(stageEnBase.candidats_idcandidats).toBe(candidat.idcandidats);
  });

  test('refuse si le candidat a déjà une demande en attente', async () => {
    const candidat = await creerCandidat();
    const { direction, service } = await creerDirectionEtService();
    await Stage.create({
      candidats_idcandidats: candidat.idcandidats,
      typeStage: 'SOUTENANCE',
      domaineStage: 'Autre domaine',
      dureeStage: 2,
      dateDebutSouhaitee: '2026-08-01',
      direction_iddirection: direction.iddirection,
      service_idservice: service.idservice,
      statusStage: 'EN_ATTENTE',
    });

    await expect(
      candidatService.soumettreDemandeStage(candidat.idcandidats, demandeValide(direction, service), fichiersComplets())
    ).rejects.toThrow('Vous avez déjà une demande de stage en attente');
  });

  test('refuse si un fichier obligatoire manque', async () => {
    const candidat = await creerCandidat();
    const { direction, service } = await creerDirectionEtService();
    const fichiers = fichiersComplets();
    delete fichiers.cv;

    await expect(
      candidatService.soumettreDemandeStage(candidat.idcandidats, demandeValide(direction, service), fichiers)
    ).rejects.toThrow('Le CV est requis');
  });

  test('refuse si la direction n\'est pas fournie', async () => {
    const candidat = await creerCandidat();
    const { direction, service } = await creerDirectionEtService();

    await expect(
      candidatService.soumettreDemandeStage(
        candidat.idcandidats,
        demandeValide(direction, service, { direction_iddirection: undefined }),
        fichiersComplets()
      )
    ).rejects.toThrow('La direction est requise');
  });

  describe('règle des 6 mois continus', () => {
    test('bloque la nouvelle demande pendant la période de repos obligatoire', async () => {
      const candidat = await creerCandidat();
      const { direction, service } = await creerDirectionEtService();

      // Chaîne de stage terminée il y a 5 jours, ayant duré exactement 6 mois.
      const dateFin = new Date();
      dateFin.setDate(dateFin.getDate() - 5);
      const dateDebut = new Date(dateFin);
      dateDebut.setMonth(dateDebut.getMonth() - 6);

      await Stage.create({
        candidats_idcandidats: candidat.idcandidats,
        typeStage: 'SOUTENANCE',
        domaineStage: 'Stage précédent',
        dureeStage: 6,
        dateDebutSouhaitee: dateDebut.toISOString().split('T')[0],
        dateDebutEffective: dateDebut.toISOString().split('T')[0],
        dateFinEffective: dateFin.toISOString().split('T')[0],
        direction_iddirection: direction.iddirection,
        service_idservice: service.idservice,
        statusStage: 'TERMINE',
      });

      await expect(
        candidatService.soumettreDemandeStage(candidat.idcandidats, demandeValide(direction, service), fichiersComplets())
      ).rejects.toThrow('limite de 6 mois de stage continu');
    });

    test('autorise la nouvelle demande une fois la période de repos passée', async () => {
      const candidat = await creerCandidat();
      const { direction, service } = await creerDirectionEtService();

      // Chaîne terminée il y a 2 mois (6 mois de stage + 1 mois de repos largement dépassé).
      const dateFin = new Date();
      dateFin.setMonth(dateFin.getMonth() - 2);
      const dateDebut = new Date(dateFin);
      dateDebut.setMonth(dateDebut.getMonth() - 6);

      await Stage.create({
        candidats_idcandidats: candidat.idcandidats,
        typeStage: 'SOUTENANCE',
        domaineStage: 'Stage précédent',
        dureeStage: 6,
        dateDebutSouhaitee: dateDebut.toISOString().split('T')[0],
        dateDebutEffective: dateDebut.toISOString().split('T')[0],
        dateFinEffective: dateFin.toISOString().split('T')[0],
        direction_iddirection: direction.iddirection,
        service_idservice: service.idservice,
        statusStage: 'TERMINE',
      });

      const result = await candidatService.soumettreDemandeStage(
        candidat.idcandidats,
        demandeValide(direction, service),
        fichiersComplets()
      );

      expect(result.statusStage).toBe('EN_ATTENTE');
    });
  });
});
