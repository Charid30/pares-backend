// Test d'intégration : la validation dépend du mode de soumission (FICHIER vs
// FORMULAIRE), avec des champs requis différents selon le cas — exactement le
// genre de branchement qu'un refactor distrait peut casser silencieusement.
jest.mock('../notification.service');
// Évite d'écrire un vrai fichier sur disque pour le mode FICHIER.
jest.mock('../../utils/fileStorage.util', () => ({
  saveFile: jest.fn(() => 'uploads/audiences/fake-path.pdf'),
}));

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const demandeAudienceService = require('../demandeAudience.service');

const fauxFichier = { buffer: Buffer.from('pdf'), originalname: 'lettre.pdf', size: 3 };

describe('createDemandeByCandidat', () => {
  beforeEach(async () => {
    await resetDb();
  });

  test('rejette un mode de soumission invalide', async () => {
    const candidat = await creerCandidat();
    await expect(
      demandeAudienceService.createDemandeByCandidat(candidat.idcandidats, { modeSoumission: 'AUTRE' }, null)
    ).rejects.toThrow('Mode de soumission invalide');
  });

  describe('mode FICHIER', () => {
    test('exige un fichier', async () => {
      const candidat = await creerCandidat();
      await expect(
        demandeAudienceService.createDemandeByCandidat(candidat.idcandidats, {
          modeSoumission: 'FICHIER',
          dateAudience: '2026-09-01',
          heureAudience: '10:00',
        }, null)
      ).rejects.toThrow('Le fichier PDF est requis');
    });

    test('exige la date et l\'heure même avec un fichier', async () => {
      const candidat = await creerCandidat();
      await expect(
        demandeAudienceService.createDemandeByCandidat(candidat.idcandidats, { modeSoumission: 'FICHIER' }, fauxFichier)
      ).rejects.toThrow('La date et l\'heure sont requises');
    });

    test('crée la demande quand fichier + date + heure sont fournis', async () => {
      const candidat = await creerCandidat();
      const demande = await demandeAudienceService.createDemandeByCandidat(candidat.idcandidats, {
        modeSoumission: 'FICHIER',
        dateAudience: '2026-09-01',
        heureAudience: '10:00',
      }, fauxFichier);

      expect(demande.status).toBe('EN_ATTENTE');
      expect(demande.fichier_filename).toBe('lettre.pdf');
      expect(demande.fichier).toBeUndefined(); // le BLOB ne doit jamais être renvoyé
    });
  });

  describe('mode FORMULAIRE', () => {
    test('exige le destinataire (pourM), la date et l\'heure', async () => {
      const candidat = await creerCandidat();
      await expect(
        demandeAudienceService.createDemandeByCandidat(candidat.idcandidats, {
          modeSoumission: 'FORMULAIRE',
          dateAudience: '2026-09-01',
          heureAudience: '10:00',
          // pourM manquant
        }, null)
      ).rejects.toThrow('Le destinataire, la date et l\'heure sont requis');
    });

    test('crée la demande quand tous les champs requis sont fournis', async () => {
      const candidat = await creerCandidat();
      const demande = await demandeAudienceService.createDemandeByCandidat(candidat.idcandidats, {
        modeSoumission: 'FORMULAIRE',
        pourM: 'Le Directeur Général',
        dateAudience: '2026-09-01',
        heureAudience: '10:00',
        motif: 'Demande de stage',
      }, null);

      expect(demande.status).toBe('EN_ATTENTE');
      expect(demande.pourM).toBe('Le Directeur Général');
    });
  });
});
