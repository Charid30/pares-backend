// =============================================================================
// Migration : comptes des approbateurs de stage des directions (liste de l'administration, 2026-10-23)
//
// Pour chaque agent de la liste :
//   - compte inexistant (ni matricule, ni e-mail, ni username déjà pris) → création de l'agent, de son compte
//     (rôle principal APPROBATION_STG, mot de passe par défaut), de sa direction et de ses préférences de
//     notification — comme userService.createAgent ;
//   - compte existant → aucun doublon ; s'il n'a pas encore le rôle Approbateur de stage, il le reçoit en rôle
//     additionnel (users_roles). Mot de passe et autres rôles inchangés ;
//   - compte existant SANS direction (rattaché à un service, ex. YAMEOGO Jean → SMT/PI) → rattaché à la direction
//     de la liste, sans service (même règle que « Modifier l'agent » : service OU directions, jamais les deux),
//     sinon l'approbateur ne voit aucune demande. Une direction déjà renseignée n'est jamais modifiée.
// Nom de famille et username en majuscules. « DCRPM » de la liste = direction CRPM (décidé avec l'administration).
//
// Idempotent : une relance ne crée rien de plus. Tout se fait dans une transaction.
// Vérification : SELECT a.matricule, a.nom, u.username, u.role_idrole FROM agents a
//   JOIN users_agents ua ON ua.agents_idagents = a.idagents JOIN users u ON u.idusers = ua.users_idusers
//   WHERE a.createdBy = 'Migration approbateurs de stage';
// Retour arrière : supprimer les comptes créés (createdBy ci-dessus) et les lignes users_roles ajoutées
//   (role_idrole = rôle APPROBATION_STG) pour YAMEOGO Jean et COULIDIATY Tikoa ; pour YAMEOGO Jean, remettre
//   service_idservice = 6 (SMT/PI), direction_iddirection = NULL et supprimer sa ligne agents_directions.
// =============================================================================
const bcrypt = require('bcryptjs');

const MOT_DE_PASSE_DEFAUT = 'P@ssw0rd';
const AUTEUR = 'Migration approbateurs de stage';

const AGENTS = [
  { direction: 'DAI',   matricule: '458', nom: 'GUIRA',           prenom: 'Moustapha',     username: 'GMOUSTAPHA', email: 'gmoustapha@sonabhy.bf' },
  { direction: 'DAI',   matricule: '360', nom: 'BOUDA',           prenom: 'Cyprien',       username: 'BCYPRIEN',   email: 'bcyprien@sonabhy.bf' },
  { direction: 'DCG',   matricule: '687', nom: 'DIALLO',          prenom: 'Tidjane',       username: 'DTIDJANE',   email: 'dtidjane@sonabhy.bf' },
  { direction: 'DCG',   matricule: '454', nom: 'OUATTARA',        prenom: 'Vla Emmanuel',  username: 'OEMMANUEL',  email: 'oemmanuel@sonabhy.bf' },
  { direction: 'DSTA',  matricule: '780', nom: 'HIEN',            prenom: 'Siébou Serge',  username: 'BSERGE',     email: 'hserge@sonabhy.bf' },
  { direction: 'DSTA',  matricule: '790', nom: 'BATAKO',          prenom: 'D. Christian',  username: 'BCHRISTIAN', email: 'bchristian@sonabhy.bf' },
  { direction: 'DCM',   matricule: '511', nom: 'OUEDRAOGO',       prenom: 'Dieudonné',     username: 'ODIEUDONNE', email: 'odieudonne@sonabhy.bf' },
  { direction: 'DCM',   matricule: '516', nom: 'ZAGRE',           prenom: 'Paulin',        username: 'ZPAULIN',    email: 'zpaulin@sonabhy.bf' },
  { direction: 'DFC',   matricule: '388', nom: 'KABORE',          prenom: 'Adèle',         username: 'KADELE',     email: 'kadele@sonabhy.bf' },
  { direction: 'DJC',   matricule: '513', nom: 'BONKOUNGOU',      prenom: 'Aguerata',      username: 'BAGUERATA',  email: 'baguerata@sonabhy.bf' },
  { direction: 'DMP',   matricule: '679', nom: 'YAMEOGO',         prenom: 'Jean',          username: 'YJEAN',      email: 'yjean@sonabhy.bf' },
  { direction: 'DMP',   matricule: '568', nom: 'COULIDIATY',      prenom: 'Tikoa',         username: 'CTIKOA',     email: 'ctikoa@sonabhy.bf' },
  { direction: 'DRH',   matricule: '781', nom: 'OUATTARA',        prenom: 'Soma Alassane', username: 'OSOMA',      email: 'osoma@sonabhy.bf' },
  { direction: 'DEP',   matricule: '390', nom: 'OUEDRAOGO',       prenom: 'Désiré',        username: 'ODESIRE',    email: 'odesire@sonabhy.bf' },
  { direction: 'CRPM',  matricule: '397', nom: 'KABRE/OUEDRAOGO', prenom: 'Rebecca',       username: 'OREBECCA',   email: 'orebecca@sonabhy.bf' },
  { direction: 'CRPM',  matricule: '440', nom: 'SAWADOGO',        prenom: 'Fidèle',        username: 'SFIDELE',    email: 'sfidele@sonabhy.bf' },
];

const TYPES_NOTIFICATION = ['STAGE', 'OFFRE', 'AIDE', 'AUDIENCE'];

module.exports.up = async (connection, { log = console.log } = {}) => {
  const [[role]] = await connection.query(
    "SELECT idrole FROM role WHERE accronyme = 'APPROBATION_STG' AND del = 0");
  if (!role) throw new Error('Rôle APPROBATION_STG introuvable');
  const idRole = role.idrole;

  const [directions] = await connection.query('SELECT iddirection, accronyme FROM direction WHERE del = 0');
  const idDirection = Object.fromEntries(directions.map((d) => [d.accronyme, d.iddirection]));
  const manquantes = [...new Set(AGENTS.map((a) => a.direction))].filter((d) => !idDirection[d]);
  if (manquantes.length) throw new Error(`Direction(s) introuvable(s) : ${manquantes.join(', ')}`);

  const hash = await bcrypt.hash(MOT_DE_PASSE_DEFAUT, 12);
  const crees = [];
  const roleAjoute = [];
  const dejaOk = [];
  const directionAjoutee = [];

  await connection.beginTransaction();
  try {
    for (const a of AGENTS) {
      const nom = a.nom.toUpperCase();
      const username = a.username.toUpperCase();

      // Compte existant : même matricule, même e-mail ou même username (agents ou utilisateurs actifs)
      const [agentsExistants] = await connection.query(
        `SELECT ag.idagents, ag.direction_iddirection,
                (SELECT COUNT(*) FROM agents_directions ad WHERE ad.agent_idagents = ag.idagents) AS nbDirections
           FROM agents ag
           LEFT JOIN users_agents ua ON ua.agents_idagents = ag.idagents
           LEFT JOIN users u ON u.idusers = ua.users_idusers AND u.del = 0
          WHERE ag.del = 0
            AND (ag.matricule = ? OR LOWER(ag.email) = LOWER(?) OR UPPER(TRIM(u.username)) = ?)`,
        [a.matricule, a.email, username]);
      for (const ag of agentsExistants) {
        if (ag.direction_iddirection || ag.nbDirections > 0) continue;
        await connection.query(
          `UPDATE agents SET service_idservice = NULL, direction_iddirection = ?, lastModifiedBy = ? WHERE idagents = ?`,
          [idDirection[a.direction], AUTEUR, ag.idagents]);
        await connection.query(
          'INSERT INTO agents_directions (agent_idagents, direction_iddirection) VALUES (?, ?)',
          [ag.idagents, idDirection[a.direction]]);
        directionAjoutee.push(`${nom} ${a.prenom} → ${a.direction}`);
      }

      const [existants] = await connection.query(
        `SELECT u.idusers, u.role_idrole FROM agents ag
           JOIN users_agents ua ON ua.agents_idagents = ag.idagents
           JOIN users u ON u.idusers = ua.users_idusers
          WHERE ag.del = 0 AND u.del = 0
            AND (ag.matricule = ? OR LOWER(ag.email) = LOWER(?) OR UPPER(TRIM(u.username)) = ?)
         UNION
         SELECT u.idusers, u.role_idrole FROM users u WHERE u.del = 0 AND UPPER(TRIM(u.username)) = ?`,
        [a.matricule, a.email, username, username]);

      if (existants.length) {
        for (const u of existants) {
          const [[deja]] = await connection.query(
            'SELECT 1 AS ok FROM users_roles WHERE users_idusers = ? AND role_idrole = ?', [u.idusers, idRole]);
          if (u.role_idrole === idRole || deja) {
            dejaOk.push(`${nom} ${a.prenom}`);
          } else {
            await connection.query(
              'INSERT IGNORE INTO users_roles (users_idusers, role_idrole) VALUES (?, ?)', [u.idusers, idRole]);
            roleAjoute.push(`${nom} ${a.prenom}`);
          }
        }
        continue;
      }

      const [resAgent] = await connection.query(
        `INSERT INTO agents (nom, prenom, matricule, email, service_idservice, direction_iddirection, createdBy, createdDate)
         VALUES (?, ?, ?, ?, NULL, ?, ?, NOW())`,
        [nom, a.prenom, a.matricule, a.email, idDirection[a.direction], AUTEUR]);
      const idAgent = resAgent.insertId;

      await connection.query(
        'INSERT IGNORE INTO agents_directions (agent_idagents, direction_iddirection) VALUES (?, ?)',
        [idAgent, idDirection[a.direction]]);

      const [resUser] = await connection.query(
        'INSERT INTO users (username, password, role_idrole) VALUES (?, ?, ?)', [username, hash, idRole]);

      await connection.query(
        'INSERT INTO users_agents (users_idusers, agents_idagents) VALUES (?, ?)', [resUser.insertId, idAgent]);

      for (const type of TYPES_NOTIFICATION) {
        await connection.query(
          `INSERT INTO agent_notification_prefs (agent_idagents, notificationType, enabled)
           SELECT ?, ?, 1 FROM DUAL WHERE NOT EXISTS
             (SELECT 1 FROM agent_notification_prefs WHERE agent_idagents = ? AND notificationType = ?)`,
          [idAgent, type, idAgent, type]);
      }
      crees.push(`${nom} ${a.prenom} (${username}, ${a.direction})`);
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  }

  log(`Comptes créés (${crees.length}) : ${crees.join(' ; ') || 'aucun'}`);
  log(`Rôle Approbateur de stage ajouté (${roleAjoute.length}) : ${roleAjoute.join(' ; ') || 'aucun'}`);
  log(`Rattachés à leur direction (${directionAjoutee.length}) : ${directionAjoutee.join(' ; ') || 'aucun'}`);
  log(`Déjà approbateurs, inchangés (${dejaOk.length}) : ${dejaOk.join(' ; ') || 'aucun'}`);
};
