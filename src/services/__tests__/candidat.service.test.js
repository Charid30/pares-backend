// Test d'intégration : soumission d'une demande de stage par un candidat — la
// règle la plus fragile de candidat.service.js, à l'intersection de plusieurs
// vérifications (stage actif existant, fichiers obligatoires, et surtout la
// limites de durée — 6 mois par service, 6 mois par année, pause — sur de vrais stages en base).
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

  describe('limites de durée (6 mois par service à vie, 6 mois par année, pause)', () => {
    const iso = (d) => d.toISOString().split('T')[0];
    const debutAnneeProchaine = `${new Date().getFullYear() + 1}-03-01`;

    // Stage terminé de 6 mois dans `service`, fini il y a `moisDepuisFin` mois (ou jours si `enJours`)
    const creerStageTermine = async (candidat, direction, service, { moisDepuisFin = 0, joursDepuisFin = 0 } = {}) => {
      const dateFin = new Date();
      dateFin.setMonth(dateFin.getMonth() - moisDepuisFin);
      dateFin.setDate(dateFin.getDate() - joursDepuisFin);
      const dateDebut = new Date(dateFin);
      dateDebut.setMonth(dateDebut.getMonth() - 6);
      dateDebut.setDate(dateDebut.getDate() + 1);
      return Stage.create({
        candidats_idcandidats: candidat.idcandidats, typeStage: 'SOUTENANCE', domaineStage: 'Stage précédent', dureeStage: 6,
        dateDebutSouhaitee: iso(dateDebut), dateDebutEffective: iso(dateDebut), dateFinEffective: iso(dateFin),
        direction_iddirection: direction.iddirection, service_idservice: service.idservice, statusStage: 'TERMINE',
      });
    };

    test('après 6 mois dans un service : 3 mois de pause avant un autre service', async () => {
      const candidat = await creerCandidat();
      const { direction, service } = await creerDirectionEtService();
      const autreService = await Service.create({ accronyme: 'RES', description: 'Réseau' });
      await creerStageTermine(candidat, direction, service, { joursDepuisFin: 5 });

      await expect(
        candidatService.soumettreDemandeStage(candidat.idcandidats,
          demandeValide(direction, autreService, { dateDebutSouhaitee: debutAnneeProchaine }), fichiersComplets())
      ).rejects.toThrow('une pause de 3 mois est obligatoire');
    });

    test('pause passée : un autre service est possible, le même service est fermé définitivement', async () => {
      const candidat = await creerCandidat();
      const { direction, service } = await creerDirectionEtService();
      const autreService = await Service.create({ accronyme: 'RES', description: 'Réseau' });
      await creerStageTermine(candidat, direction, service, { moisDepuisFin: 4 });

      await expect(
        candidatService.soumettreDemandeStage(candidat.idcandidats,
          demandeValide(direction, service, { dateDebutSouhaitee: debutAnneeProchaine }), fichiersComplets())
      ).rejects.toThrow('il ne vous est plus ouvert');

      const result = await candidatService.soumettreDemandeStage(candidat.idcandidats,
        demandeValide(direction, autreService, { dateDebutSouhaitee: debutAnneeProchaine }), fichiersComplets());
      expect(result.statusStage).toBe('EN_ATTENTE');
    });
  });
});
