// Test d'intégration : auth.service.js — la zone la plus critique de
// l'application. register() (unicité multi-champs) et surtout login()
// (résolution username/email candidat/email agent, vérification du mot de
// passe hashé, agrégation multi-rôles, calcul des permissions et des modules
// "lecture globale" injectés dans le token JWT).
jest.mock('../email.service');

const { resetDb } = require('../../__tests__/helpers/testDb');
const { Role, User, Candidat, Agent, UserAgent, Permission, PasswordResetToken } = require('../../models');
const { decodeToken } = require('../../utils/jwt.util');
const emailService = require('../email.service');
const authService = require('../auth.service');

// sendPasswordResetEmail est appelé en fire-and-forget avec un .catch() direct sur la
// promesse (pas de await) : l'auto-mock par défaut renvoie undefined, ce qui plante.
emailService.sendPasswordResetEmail.mockResolvedValue();

beforeEach(async () => {
  await resetDb();
  // register() force idrole=6 pour le rôle CANDIDAT (valeur historique côdée en dur).
  await Role.create({ idrole: 6, accronyme: 'CANDIDAT', description: 'Candidat' });
});

describe('register', () => {
  const donneesValides = () => ({
    username: `jdoe-${Date.now()}`,
    password: 'MotDePasse123!',
    nom: 'Doe',
    prenom: 'Jane',
    genre: 'FEMME',
    email: `jane-${Date.now()}@example.com`,
    telephone: `70${Date.now()}`.slice(0, 12),
    nip: `NIP-${Date.now()}`,
  });

  test('crée le compte et retourne un token valide avec le rôle CANDIDAT', async () => {
    const result = await authService.register(donneesValides());

    expect(result.user.role).toBe('CANDIDAT');
    expect(result.token).toBeTruthy();
    const decoded = decodeToken(result.token);
    expect(decoded.candidatId).toBe(result.candidat.idcandidats);
  });

  test('refuse un nom d\'utilisateur déjà utilisé', async () => {
    const data = donneesValides();
    await authService.register(data);

    await expect(
      authService.register({ ...data, email: 'autre@example.com', telephone: '70000001', nip: 'NIP-AUTRE' })
    ).rejects.toThrow('Ce nom d\'utilisateur existe déjà');
  });

  test('refuse un email déjà utilisé', async () => {
    const data = donneesValides();
    await authService.register(data);

    await expect(
      authService.register({ ...data, username: 'autre-user', telephone: '70000002', nip: 'NIP-AUTRE2' })
    ).rejects.toThrow('Un compte existe déjà avec cette adresse email');
  });

  test('refuse un IFU déjà utilisé', async () => {
    const data = donneesValides();
    await authService.register({ ...data, ifu: 'IFU-DUPLIQUE' });

    await expect(
      authService.register({
        ...data,
        username: 'autre-user2',
        email: 'autre2@example.com',
        telephone: '70000003',
        nip: 'NIP-AUTRE3',
        ifu: 'IFU-DUPLIQUE',
      })
    ).rejects.toThrow('Un compte existe déjà avec ce numéro IFU');
  });
});

const creerCandidatAvecCompte = async (username, password, overrides = {}) => {
  const roleCandidat = await Role.findOne({ where: { accronyme: 'CANDIDAT' } });
  const user = await User.create({ username, password, role_idrole: roleCandidat.idrole });
  const candidat = await Candidat.create({
    users_idusers: user.idusers,
    nom: 'Doe',
    prenom: 'Jane',
    email: `${username}@example.com`,
    telephone: `7000${Date.now()}`.slice(0, 12),
    ...overrides,
  });
  return { user, candidat };
};

describe('login', () => {
  test('connecte un candidat par username (insensible à la casse)', async () => {
    await creerCandidatAvecCompte('Jane.Doe', 'motdepasse123');

    const result = await authService.login('jane.doe', 'motdepasse123');

    expect(result.user.role).toBe('CANDIDAT');
    expect(result.candidat).toBeTruthy();
  });

  test('refuse un mot de passe incorrect', async () => {
    await creerCandidatAvecCompte('jane.doe', 'motdepasse123');

    await expect(authService.login('jane.doe', 'mauvais-mot-de-passe')).rejects.toThrow('incorrect');
  });

  test('refuse un identifiant inconnu', async () => {
    await expect(authService.login('personne.inconnue', 'peu-importe')).rejects.toThrow('incorrect');
  });

  test('connecte un candidat via son email (fallback si le username ne correspond pas)', async () => {
    const { candidat } = await creerCandidatAvecCompte('jane.doe', 'motdepasse123');

    const result = await authService.login(candidat.email, 'motdepasse123');

    expect(result.candidat.idcandidats).toBe(candidat.idcandidats);
  });

  test('connecte un agent via son email (fallback agent)', async () => {
    const role = await Role.create({ accronyme: 'AGENT_X', description: 'Agent X' });
    const user = await User.create({ username: 'agent.x', password: 'motdepasse123', role_idrole: role.idrole });
    const agent = await Agent.create({
      nom: 'Agent', prenom: 'X', matricule: `MAT-${Date.now()}`, email: `agent.x.${Date.now()}@example.com`,
    });
    await UserAgent.create({ users_idusers: user.idusers, agents_idagents: agent.idagents });

    const result = await authService.login(agent.email, 'motdepasse123');

    expect(result.agent.idagents).toBe(agent.idagents);
    expect(result.user.matricule).toBe(agent.matricule);
  });

  test('agrège les permissions de tous les rôles (principal + additionnels)', async () => {
    const rolePrincipal = await Role.create({ accronyme: 'AGENT_A', description: 'Agent A' });
    const roleAdditionnel = await Role.create({ accronyme: 'AGENT_B', description: 'Agent B' });
    await Permission.create({ role_idrole: rolePrincipal.idrole, module: 'STAGE', action: 'CONSULTER' });
    await Permission.create({ role_idrole: roleAdditionnel.idrole, module: 'OFFRE', action: 'VALIDER' });

    const user = await User.create({ username: 'multi.role', password: 'motdepasse123', role_idrole: rolePrincipal.idrole });
    // Association many-to-many User <-> Role pour les rôles additionnels (alias 'additionalRoles').
    await user.addAdditionalRoles([roleAdditionnel.idrole]);

    const result = await authService.login('multi.role', 'motdepasse123');

    const modules = result.user.permissions.map(p => `${p.module}:${p.action}`);
    expect(modules).toEqual(expect.arrayContaining(['STAGE:CONSULTER', 'OFFRE:VALIDER']));
  });

  test('calcule lectureGlobaleModules uniquement pour les rôles lectureGlobale avec CONSULTER', async () => {
    const role = await Role.create({ accronyme: 'SOUS_ADMIN', description: 'Sous-admin', lectureGlobale: true });
    await Permission.create({ role_idrole: role.idrole, module: 'STAGE', action: 'CONSULTER' });
    await Permission.create({ role_idrole: role.idrole, module: 'OFFRE', action: 'VALIDER' }); // pas CONSULTER : exclu
    await User.create({ username: 'sous.admin', password: 'motdepasse123', role_idrole: role.idrole });

    const result = await authService.login('sous.admin', 'motdepasse123');

    expect(result.user.lectureGlobaleModules).toEqual(['STAGE']);
  });
});

describe('forgotPassword', () => {
  test('ne révèle pas si l\'email n\'existe pas (sent:false, notFound:true)', async () => {
    const result = await authService.forgotPassword('inconnu@example.com');
    expect(result).toEqual({ sent: false, notFound: true });
  });

  test('crée un token de réinitialisation pour un email connu', async () => {
    const { candidat } = await creerCandidatAvecCompte('jane.doe', 'motdepasse123');

    const result = await authService.forgotPassword(candidat.email);

    expect(result.sent).toBe(true);
    const tokens = await PasswordResetToken.count();
    expect(tokens).toBe(1);
  });

  test('applique le cooldown de 240s entre deux demandes successives', async () => {
    const { candidat } = await creerCandidatAvecCompte('jane.doe', 'motdepasse123');
    await authService.forgotPassword(candidat.email);

    const result = await authService.forgotPassword(candidat.email);

    expect(result).toEqual(expect.objectContaining({ sent: true, cooldown: true }));
    expect(result.waitSeconds).toBeGreaterThan(0);
    // Toujours un seul token actif, pas un second créé pendant le cooldown.
    const tokens = await PasswordResetToken.count();
    expect(tokens).toBe(1);
  });

  test('autorise une nouvelle demande une fois le cooldown passé', async () => {
    const { candidat, user } = await creerCandidatAvecCompte('jane.doe', 'motdepasse123');
    // Simuler un ancien token créé il y a plus de 240s (expires_at = created_at + 1h).
    const creeIl_y_a_5min = new Date(Date.now() - 5 * 60 * 1000);
    await PasswordResetToken.create({
      user_id: user.idusers,
      token: 'ancien-token',
      expires_at: new Date(creeIl_y_a_5min.getTime() + 3600 * 1000),
      used: 0,
    });

    const result = await authService.forgotPassword(candidat.email);

    expect(result).toEqual({ sent: true });
    // L'ancien token doit avoir été supprimé et remplacé par un nouveau.
    const tokens = await PasswordResetToken.findAll({ where: { user_id: user.idusers } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].token).not.toBe('ancien-token');
  });
});

describe('resetPassword', () => {
  test('refuse un token inconnu', async () => {
    await expect(authService.resetPassword('token-inexistant', 'NouveauMotDePasse123')).rejects.toThrow('invalide ou déjà utilisé');
  });

  test('refuse un token déjà utilisé', async () => {
    const { user } = await creerCandidatAvecCompte('jane.doe', 'motdepasse123');
    await PasswordResetToken.create({
      user_id: user.idusers, token: 'token-utilise', expires_at: new Date(Date.now() + 3600000), used: 1,
    });

    await expect(authService.resetPassword('token-utilise', 'NouveauMotDePasse123')).rejects.toThrow('invalide ou déjà utilisé');
  });

  test('refuse et supprime un token expiré', async () => {
    const { user } = await creerCandidatAvecCompte('jane.doe', 'motdepasse123');
    await PasswordResetToken.create({
      user_id: user.idusers, token: 'token-expire', expires_at: new Date(Date.now() - 1000), used: 0,
    });

    await expect(authService.resetPassword('token-expire', 'NouveauMotDePasse123')).rejects.toThrow('expiré');

    const tokenEnBase = await PasswordResetToken.findOne({ where: { token: 'token-expire' } });
    expect(tokenEnBase).toBeNull();
  });

  test('change le mot de passe et invalide le token après usage', async () => {
    const { user } = await creerCandidatAvecCompte('jane.doe', 'ancien-mot-de-passe');
    await PasswordResetToken.create({
      user_id: user.idusers, token: 'token-valide', expires_at: new Date(Date.now() + 3600000), used: 0,
    });

    const result = await authService.resetPassword('token-valide', 'NouveauMotDePasse123');
    expect(result.reset).toBe(true);

    // L'ancien mot de passe ne fonctionne plus, le nouveau fonctionne.
    await expect(authService.login('jane.doe', 'ancien-mot-de-passe')).rejects.toThrow();
    const loginResult = await authService.login('jane.doe', 'NouveauMotDePasse123');
    expect(loginResult.user.idusers).toBe(user.idusers);

    // Le token a été détruit, donc réutilisable nulle part.
    const tokenEnBase = await PasswordResetToken.findOne({ where: { token: 'token-valide' } });
    expect(tokenEnBase).toBeNull();
  });
});
