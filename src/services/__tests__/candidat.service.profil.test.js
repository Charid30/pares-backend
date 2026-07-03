// Test d'intégration : updateProfilCandidat — exclusivité IFU/récépissé,
// unicité des deux, et cooldown de 25 jours sur le changement de nom
// d'utilisateur. Zone fragile : plusieurs règles imbriquées sur les mêmes champs.
const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat } = require('../../__tests__/helpers/fixtures');
const { User } = require('../../models');
const candidatService = require('../candidat.service');

describe('updateProfilCandidat', () => {
  beforeEach(async () => {
    await resetDb();
  });

  describe('IFU / récépissé', () => {
    test('refuse d\'ajouter un IFU si un récépissé existe déjà', async () => {
      const candidat = await creerCandidat({ recipisse: 'REC-001' });
      await expect(
        candidatService.updateProfilCandidat(candidat.idcandidats, { ifu: 'IFU-001' })
      ).rejects.toThrow('Vous ne pouvez pas avoir un IFU et un récépissé simultanément');
    });

    test('refuse d\'ajouter un récépissé si un IFU existe déjà', async () => {
      const candidat = await creerCandidat({ ifu: 'IFU-001' });
      await expect(
        candidatService.updateProfilCandidat(candidat.idcandidats, { recipisse: 'REC-001' })
      ).rejects.toThrow('Vous ne pouvez pas avoir un récépissé et un IFU simultanément');
    });

    test('refuse un IFU déjà utilisé par un autre candidat', async () => {
      await creerCandidat({ ifu: 'IFU-DUPLIQUE' });
      const candidat2 = await creerCandidat();

      await expect(
        candidatService.updateProfilCandidat(candidat2.idcandidats, { ifu: 'IFU-DUPLIQUE' })
      ).rejects.toThrow('Ce numéro IFU est déjà associé à un autre compte');
    });

    test('bascule IFU → récépissé en un seul appel (cas exact envoyé par le formulaire frontend)', async () => {
      const candidat = await creerCandidat({ ifu: 'IFU-001' });

      const updated = await candidatService.updateProfilCandidat(candidat.idcandidats, { ifu: null, recipisse: 'REC-001' });

      expect(updated.recipisse).toBe('REC-001');
      expect(updated.ifu).toBeNull();
    });

    test('bascule récépissé → IFU en un seul appel', async () => {
      const candidat = await creerCandidat({ recipisse: 'REC-001' });

      const updated = await candidatService.updateProfilCandidat(candidat.idcandidats, { recipisse: null, ifu: 'IFU-001' });

      expect(updated.ifu).toBe('IFU-001');
      expect(updated.recipisse).toBeNull();
    });

    test('refuse toujours de poser les deux à une valeur non vide dans le même appel', async () => {
      const candidat = await creerCandidat();

      await expect(
        candidatService.updateProfilCandidat(candidat.idcandidats, { ifu: 'IFU-001', recipisse: 'REC-001' })
      ).rejects.toThrow('Vous ne pouvez pas avoir un IFU et un récépissé simultanément');
    });

    test('refuse toujours de poser un IFU sans effacer explicitement le récépissé existant', async () => {
      const candidat = await creerCandidat({ recipisse: 'REC-001' });

      await expect(
        candidatService.updateProfilCandidat(candidat.idcandidats, { ifu: 'IFU-001' })
      ).rejects.toThrow('Vous ne pouvez pas avoir un IFU et un récépissé simultanément');
    });
  });

  describe('nom d\'utilisateur — cooldown 25 jours', () => {
    test('refuse un changement avant la fin du cooldown', async () => {
      const candidat = await creerCandidat();
      const il_y_a_10_jours = new Date();
      il_y_a_10_jours.setDate(il_y_a_10_jours.getDate() - 10);
      await User.update(
        { lastUsernameChange: il_y_a_10_jours },
        { where: { idusers: candidat.users_idusers } }
      );

      await expect(
        candidatService.updateProfilCandidat(candidat.idcandidats, { username: 'nouveau.pseudo' })
      ).rejects.toThrow('tous les 25 jours');
    });

    test('autorise le changement une fois le cooldown passé', async () => {
      const candidat = await creerCandidat();
      const il_y_a_30_jours = new Date();
      il_y_a_30_jours.setDate(il_y_a_30_jours.getDate() - 30);
      await User.update(
        { lastUsernameChange: il_y_a_30_jours },
        { where: { idusers: candidat.users_idusers } }
      );

      await candidatService.updateProfilCandidat(candidat.idcandidats, { username: 'nouveau.pseudo' });

      const user = await User.findByPk(candidat.users_idusers);
      expect(user.username).toBe('nouveau.pseudo');
    });

    test('refuse un nom d\'utilisateur déjà pris', async () => {
      const candidatA = await creerCandidat();
      const candidatB = await creerCandidat();
      const userA = await User.findByPk(candidatA.users_idusers);

      await expect(
        candidatService.updateProfilCandidat(candidatB.idcandidats, { username: userA.username })
      ).rejects.toThrow('Ce nom d\'utilisateur est déjà pris');
    });

    test('un premier changement (sans lastUsernameChange) ne déclenche pas le cooldown', async () => {
      const candidat = await creerCandidat();
      await candidatService.updateProfilCandidat(candidat.idcandidats, { username: 'premier.changement' });

      const user = await User.findByPk(candidat.users_idusers);
      expect(user.username).toBe('premier.changement');
    });
  });
});
