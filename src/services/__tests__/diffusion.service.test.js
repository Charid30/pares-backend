// Notifications envoyées volontairement par l'admin : destinataires, cloche, push, historique.
jest.mock('../push.service', () => {
  const reel = jest.requireActual('../push.service');
  return {
    ...reel,
    isConfigured: true,
    envoyerPushEnMasse: jest.fn(async abonnements => ({ reussis: abonnements.length, echecs: 0 })),
  };
});
jest.mock('../email.service');

const { resetDb } = require('../../__tests__/helpers/testDb');
const { creerCandidat, creerDirection } = require('../../__tests__/helpers/fixtures');
const {
  Agent, Candidat, Notification, NotificationDiffusion, PushSubscription, User,
} = require('../../models');
const pushService = require('../push.service');
const diffusionService = require('../diffusion.service');

let compteur = 0;
const creerAgent = (overrides = {}) => {
  compteur += 1;
  return Agent.create({
    nom: 'Agent', prenom: `N${compteur}`, matricule: `MAT-${compteur}-${Date.now()}`,
    email: `agent${compteur}-${Date.now()}@example.com`, ...overrides,
  });
};
const abonner = (recipientType, recipientId) => {
  compteur += 1;
  return PushSubscription.create({
    recipient_type: recipientType, recipient_id: recipientId,
    endpoint: `https://push.example.com/${compteur}`, p256dh: 'p', auth: 'a',
  });
};
const auteur = { agentId: null, nom: 'admin' };
const message = { titre: 'Maintenance', message: 'Le portail sera indisponible ce soir de 22 h à 23 h.' };

beforeEach(async () => {
  await resetDb();
  jest.clearAllMocks();
});

describe('destinataires', () => {
  test('candidats : seuls les comptes non supprimés', async () => {
    const actif = await creerCandidat();
    const supprime = await creerCandidat();
    await supprime.update({ del: 1 });
    const userSupprime = await creerCandidat();
    await User.update({ del: 1 }, { where: { idusers: userSupprime.users_idusers } });
    await creerAgent();

    const apercu = await diffusionService.apercu({ cible: 'CANDIDATS' });
    expect(apercu).toMatchObject({ candidats: 1, agents: 0 });

    await diffusionService.envoyer({ cible: 'CANDIDATS', ...message }, auteur);
    const notifs = await Notification.findAll();
    expect(notifs.map(n => n.recipient_id)).toEqual([actif.idcandidats]);
    expect(notifs[0]).toMatchObject({ recipient_type: 'CANDIDAT', type: 'ANNONCE', titre: 'Maintenance', read: 0 });
    expect(notifs[0].link).toMatch(/\/dashboard\/candidat$/);
  });

  test('agents : actifs seulement, et filtrés par direction si demandé', async () => {
    const dsi = await creerDirection({ nom: 'DSI', accronyme: 'DSI' });
    const drh = await creerDirection({ nom: 'DRH', accronyme: 'DRH' });
    const agentDsi = await creerAgent({ direction_iddirection: dsi.iddirection });
    const agentDrh = await creerAgent({ direction_iddirection: drh.iddirection });
    await creerAgent({ direction_iddirection: dsi.iddirection, actif: 0 });
    await creerAgent({ direction_iddirection: dsi.iddirection, del: 1 });
    await creerCandidat();

    expect(await diffusionService.apercu({ cible: 'AGENTS' })).toMatchObject({ candidats: 0, agents: 2 });
    expect(await diffusionService.apercu({ cible: 'AGENTS', directions: [dsi.iddirection] })).toMatchObject({ agents: 1 });

    await diffusionService.envoyer({ cible: 'AGENTS', directions: [dsi.iddirection], ...message }, auteur);
    const ids = (await Notification.findAll()).map(n => n.recipient_id);
    expect(ids).toEqual([agentDsi.idagents]);
    expect(ids).not.toContain(agentDrh.idagents);
  });

  test('tout le monde : candidats et agents', async () => {
    await creerCandidat();
    await creerCandidat();
    await creerAgent();
    expect(await diffusionService.apercu({ cible: 'TOUS' })).toMatchObject({ candidats: 2, agents: 1 });
    const { diffusion } = await diffusionService.envoyer({ cible: 'TOUS', ...message }, auteur);
    expect(diffusion.nbDestinataires).toBe(3);
    expect(await Notification.count({ where: { type: 'ANNONCE' } })).toBe(3);
  });
});

describe('push et historique', () => {
  test('push envoyé aux seuls appareils abonnés des destinataires ; bilan écrit dans l\'historique', async () => {
    const candidat = await creerCandidat();
    const agent = await creerAgent();
    await abonner('CANDIDAT', candidat.idcandidats);
    await abonner('CANDIDAT', candidat.idcandidats); // deuxième appareil
    await abonner('AGENT', agent.idagents);

    expect((await diffusionService.apercu({ cible: 'CANDIDATS' })).appareils).toBe(2);

    const { diffusion, terminePush } = await diffusionService.envoyer({ cible: 'CANDIDATS', ...message }, { agentId: 7, nom: 'admin' });
    await terminePush;

    const [abonnements, payloadDe] = pushService.envoyerPushEnMasse.mock.calls[0];
    expect(abonnements).toHaveLength(2);
    expect(abonnements.every(s => s.recipient_type === 'CANDIDAT')).toBe(true);
    expect(payloadDe(abonnements[0])).toMatchObject({ title: 'Maintenance', body: message.message });

    const ligne = await NotificationDiffusion.findByPk(diffusion.id);
    expect(ligne).toMatchObject({
      cible: 'CANDIDATS', nbDestinataires: 1, nbAppareils: 2, nbPushReussis: 2, nbPushEchecs: 0, envoyeParId: 7, envoyePar: 'admin',
    });
  });

  test('historique : plus récent d\'abord, avec le nom des directions ciblées', async () => {
    const dsi = await creerDirection({ nom: 'Direction des SI', accronyme: 'DSI' });
    await creerAgent({ direction_iddirection: dsi.iddirection });
    await creerCandidat();
    await (await diffusionService.envoyer({ cible: 'CANDIDATS', titre: 'Premier', message: 'Un' }, auteur)).terminePush;
    await (await diffusionService.envoyer({ cible: 'AGENTS', directions: [dsi.iddirection], titre: 'Second', message: 'Deux' }, auteur)).terminePush;

    const liste = await diffusionService.historique();
    expect(liste.map(l => l.titre)).toEqual(['Second', 'Premier']);
    expect(liste[0].directions).toEqual([{ iddirection: dsi.iddirection, nom: 'DSI' }]);
    expect(liste[1].directions).toEqual([]);
  });
});

describe('contrôles', () => {
  test.each([
    [{ cible: 'PERSONNE', ...message }, 'Destinataires invalides'],
    [{ cible: 'CANDIDATS', titre: '', message: 'x' }, 'titre est obligatoire'],
    [{ cible: 'CANDIDATS', titre: 'x', message: '   ' }, 'message est obligatoire'],
    [{ cible: 'CANDIDATS', titre: 'x'.repeat(101), message: 'x' }, '100 caractères'],
    [{ cible: 'CANDIDATS', titre: 'x', message: 'x'.repeat(501) }, '500 caractères'],
    [{ cible: 'CANDIDATS', directions: [1], ...message }, 'ne concerne que les agents'],
  ])('refuse %j', async (donnees, attendu) => {
    await creerCandidat();
    await expect(diffusionService.envoyer(donnees, auteur)).rejects.toThrow(attendu);
    expect(await Notification.count()).toBe(0);
    expect(await NotificationDiffusion.count()).toBe(0);
  });

  test('aucun destinataire : refus, rien n\'est écrit', async () => {
    await expect(diffusionService.envoyer({ cible: 'AGENTS', ...message }, auteur)).rejects.toThrow('Aucun destinataire');
    expect(await NotificationDiffusion.count()).toBe(0);
    expect(await Candidat.count()).toBe(0);
  });
});

describe('route réservée à l\'admin', () => {
  const reponse = () => {
    const res = { statut: null };
    res.status = (s) => { res.statut = s; return res; };
    res.json = () => res;
    return res;
  };

  test.each(['GET /', 'POST /apercu', 'POST /'])('%s : agent refusé (403), admin accepté', (route) => {
    const router = require('../../routes/diffusion.routes');
    const [methode, chemin] = route.split(' ');
    const couche = router.stack.find(l => l.route.path === chemin && l.route.methods[methode.toLowerCase()]);
    const autoriser = couche.route.stack[1].handle; // [authenticate, authorize('ADMIN'), contrôleur]

    const resAgent = reponse(); const suiteAgent = jest.fn();
    autoriser({ user: { role: 'AGENT_RH', roles: ['AGENT_RH'] } }, resAgent, suiteAgent);
    expect(resAgent.statut).toBe(403);
    expect(suiteAgent).not.toHaveBeenCalled();

    const suiteAdmin = jest.fn();
    autoriser({ user: { role: 'ADMIN', roles: ['ADMIN'] } }, reponse(), suiteAdmin);
    expect(suiteAdmin).toHaveBeenCalled();
  });
});
