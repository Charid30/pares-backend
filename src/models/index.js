// src/models/index.js
const { sequelize } = require('../config/database');
const env = require('../config/env');

// En test, le schéma complet est recréé par le helper de test (sequelize.sync({force:true}))
// avant chaque test — les sync individuels ci-dessous (qui tournent en arrière-plan dès le
// require() de ce fichier, donc avant ce sync complet) ne font qu'échouer bruyamment en
// "no such table" puisqu'aucune table n'existe encore à ce moment-là. Inutiles en test.
const isTestEnv = env.NODE_ENV === 'test';

// =====================================================
// IMPORTER TOUS LES MODÈLES
// =====================================================

// Module Utilisateurs
const Role = require('./role')(sequelize);
const Permission = require('./permission')(sequelize);
const User = require('./User')(sequelize);
const Candidat = require('./Candidat')(sequelize);
const Direction = require('./Direction')(sequelize);
const Service = require('./Service')(sequelize);
const Agent = require('./Agent')(sequelize);
const UserAgent = require('./UserAgent')(sequelize);
const UserRole = require('./UserRole')(sequelize);
if (!isTestEnv) UserRole.sync({ force: false }).catch(e => console.error('UserRole sync:', e.message));
const DirectionService = require('./DirectionService')(sequelize);

// Module Stage
const Stage = require('./Stage')(sequelize);
const RenouvellementStage = require('./renouvellementStage')(sequelize);
const RapportStage = require('./rapportStage')(sequelize);
const DocumentStage = require('./documentStage')(sequelize);
const DemandeModificationStage = require('./DemandeModificationStage')(sequelize);
if (!isTestEnv) DemandeModificationStage.sync({ force: false }).catch(e => console.error('DemandeModificationStage sync:', e.message));
const AutorisationRenouvellementStage = require('./AutorisationRenouvellementStage')(sequelize);
if (!isTestEnv) AutorisationRenouvellementStage.sync({ force: false }).catch(e => console.error('AutorisationRenouvellementStage sync:', e.message));

// Module Offres
const Offre = require('./Offre')(sequelize);
const CandidatureOffre = require('./candidatureOffre')(sequelize);

// Module Aides
const Aide = require('./Aide')(sequelize);
const CandidatureAide = require('./candidatureAide')(sequelize);

// Module Demandes d'Audience
const DemandeAudience = require('./DemandeAudience')(sequelize);

// Notifications agents (préférences email)
const AgentNotificationPref = require('./AgentNotificationPref')(sequelize);

// Notifications in-app
const Notification = require('./Notification')(sequelize);

// Auth
const PasswordResetToken = require('./PasswordResetToken')(sequelize);
const RevokedToken = require('./RevokedToken')(sequelize);
const RateLimitEntry = require('./RateLimitEntry')(sequelize);

// Paramètres application
const AppSettings = require('./AppSettings')(sequelize);
if (!isTestEnv) AppSettings.sync({ force: false }).catch(e => console.error('AppSettings sync:', e.message));

// File d'attente des emails (limite journalière)
const EmailQueue = require('./EmailQueue')(sequelize);
if (!isTestEnv) EmailQueue.sync({ force: false }).catch(e => console.error('EmailQueue sync:', e.message));

// IPs bannies (sécurité)
const BannedIp = require('./BannedIp');
if (!isTestEnv) BannedIp.sync({ force: false }).catch(e => console.error('BannedIp sync:', e.message));

// Clés API (applications externes)
const ApiKey = require('./ApiKey')(sequelize);
if (!isTestEnv) ApiKey.sync({ force: false }).catch(e => console.error('ApiKey sync:', e.message));

// Créer la table notifications si elle n'existe pas
if (!isTestEnv) Notification.sync({ force: false }).catch(e => console.error('Notification sync:', e.message));

// Journal d'audit
const AuditLog = require('./AuditLog');
if (!isTestEnv) AuditLog.sync({ force: false }).catch(e => console.error('AuditLog sync:', e.message));

// Créer la table agent_notification_prefs si elle n'existe pas
if (!isTestEnv) {
  AgentNotificationPref.sync({ force: false }).then(async () => {
    // Initialiser les prefs pour TOUS les agents existants qui n'en ont pas encore
    // (y compris les admins qui doivent recevoir toutes les notifications)
    try {
      const agents = await Agent.findAll({ where: { del: 0 }, attributes: ['idagents'] });
      const TYPES = ['STAGE', 'OFFRE', 'AIDE', 'AUDIENCE'];
      for (const agent of agents) {
        for (const type of TYPES) {
          await AgentNotificationPref.findOrCreate({
            where: { agent_idagents: agent.idagents, notificationType: type },
            defaults: { enabled: 1 },
          });
        }
      }
      if (agents.length > 0) {
        console.log(`✅ Prefs notifications initialisées pour ${agents.length} agent(s)`);
      }
    } catch (e) {
      console.error('Erreur init prefs agents:', e.message);
    }
  }).catch(e => console.error('AgentNotificationPref sync:', e.message));
}

// =====================================================
// DÉFINIR LES ASSOCIATIONS
// =====================================================

// -----------------------------------------------------
// MODULE UTILISATEURS
// -----------------------------------------------------

// Role ↔ Permission (1:N)
Role.hasMany(Permission, {
  foreignKey: 'role_idrole',
  as: 'permissions',
});
Permission.belongsTo(Role, {
  foreignKey: 'role_idrole',
  as: 'role',
});

// Role ↔ User (1:N) — rôle PRINCIPAL
Role.hasMany(User, {
  foreignKey: 'role_idrole',
  as: 'users',
});
User.belongsTo(Role, {
  foreignKey: 'role_idrole',
  as: 'role',
});

// User ↔ Role (N:M) via users_roles — rôles ADDITIONNELS
User.belongsToMany(Role, {
  through: UserRole,
  foreignKey: 'users_idusers',
  otherKey: 'role_idrole',
  as: 'additionalRoles',
});
Role.belongsToMany(User, {
  through: UserRole,
  foreignKey: 'role_idrole',
  otherKey: 'users_idusers',
  as: 'usersWithAdditionalRole',
});

// User ↔ Candidat (1:1)
User.hasOne(Candidat, {
  foreignKey: 'users_idusers',
  as: 'candidat',
});
Candidat.belongsTo(User, {
  foreignKey: 'users_idusers',
  as: 'user',
});

// Service ↔ Agent (1:N)
Service.hasMany(Agent, {
  foreignKey: 'service_idservice',
  as: 'agents',
});
Agent.belongsTo(Service, {
  foreignKey: 'service_idservice',
  as: 'service',
});

// Direction ↔ Agent (1:N) — rattachement direct, pour les agents sans service
Direction.hasMany(Agent, {
  foreignKey: 'direction_iddirection',
  as: 'agentsDirects',
});
Agent.belongsTo(Direction, {
  foreignKey: 'direction_iddirection',
  as: 'directionDirecte',
});

// User ↔ Agent (N:M) via users_agents
User.belongsToMany(Agent, {
  through: UserAgent,
  foreignKey: 'users_idusers',
  otherKey: 'agents_idagents',
  as: 'agents',
});
Agent.belongsToMany(User, {
  through: UserAgent,
  foreignKey: 'agents_idagents',
  otherKey: 'users_idusers',
  as: 'users',
});

// Direction ↔ Service (N:M) via direction_service
Direction.belongsToMany(Service, {
  through: DirectionService,
  foreignKey: 'direction_iddirection',
  otherKey: 'service_idservice',
  as: 'services',
});
Service.belongsToMany(Direction, {
  through: DirectionService,
  foreignKey: 'service_idservice',
  otherKey: 'direction_iddirection',
  as: 'directions',
});

// -----------------------------------------------------
// MODULE STAGE
// -----------------------------------------------------

// Candidat ↔ Stage (1:N)
Candidat.hasMany(Stage, {
  foreignKey: 'candidats_idcandidats',
  as: 'stages',
});
Stage.belongsTo(Candidat, {
  foreignKey: 'candidats_idcandidats',
  as: 'candidat',
});

// Stage ↔ Stage (auto-référence pour renouvellement)
Stage.hasMany(Stage, {
  foreignKey: 'stage_parent_idstage',
  as: 'renouvellements',
});
Stage.belongsTo(Stage, {
  foreignKey: 'stage_parent_idstage',
  as: 'stageParent',
});

// Stage ↔ RenouvellementStage (1:N pour stage actuel)
Stage.hasMany(RenouvellementStage, {
  foreignKey: 'stage_actuel_idstage',
  as: 'renouvellementsActuels',
});
RenouvellementStage.belongsTo(Stage, {
  foreignKey: 'stage_actuel_idstage',
  as: 'stageActuel',
});

// Stage ↔ RenouvellementStage (1:N pour stage nouveau)
Stage.hasMany(RenouvellementStage, {
  foreignKey: 'stage_nouveau_idstage',
  as: 'renouvellementsNouveaux',
});
RenouvellementStage.belongsTo(Stage, {
  foreignKey: 'stage_nouveau_idstage',
  as: 'stageNouveau',
});

// Stage ↔ RapportStage (1:1)
Stage.hasOne(RapportStage, {
  foreignKey: 'stage_idstage',
  as: 'rapport',
});
RapportStage.belongsTo(Stage, {
  foreignKey: 'stage_idstage',
  as: 'stage',
});

// Stage ↔ DocumentStage (1:N)
Stage.hasMany(DocumentStage, {
  foreignKey: 'stage_idstage',
  as: 'documents',
});
DocumentStage.belongsTo(Stage, {
  foreignKey: 'stage_idstage',
  as: 'stage',
});

// Stage ↔ Direction (N:1)
Stage.belongsTo(Direction, {
  foreignKey: 'direction_iddirection',
  as: 'direction',
});
Direction.hasMany(Stage, {
  foreignKey: 'direction_iddirection',
  as: 'stages',
});

// Stage ↔ Service (N:1) — service dans lequel le candidat effectue son stage
Stage.belongsTo(Service, {
  foreignKey: 'service_idservice',
  as: 'serviceStage',
});
Service.hasMany(Stage, {
  foreignKey: 'service_idservice',
  as: 'stages',
});

// Stage ↔ DemandeModificationStage (1:N)
Stage.hasMany(DemandeModificationStage, {
  foreignKey: 'stage_idstage',
  as: 'demandesModification',
});
DemandeModificationStage.belongsTo(Stage, {
  foreignKey: 'stage_idstage',
  as: 'stage',
});

// Stage ↔ AutorisationRenouvellementStage (1:N)
Stage.hasMany(AutorisationRenouvellementStage, {
  foreignKey: 'stage_idstage',
  as: 'autorisationsRenouvellement',
});
AutorisationRenouvellementStage.belongsTo(Stage, {
  foreignKey: 'stage_idstage',
  as: 'stage',
});

// Agent ↔ AutorisationRenouvellementStage (1:N)
Agent.hasMany(AutorisationRenouvellementStage, {
  foreignKey: 'autorisePar',
  as: 'autorisationsAccordees',
});
AutorisationRenouvellementStage.belongsTo(Agent, {
  foreignKey: 'autorisePar',
  as: 'agentAutorisateur',
});

// Candidat ↔ DemandeModificationStage (1:N)
Candidat.hasMany(DemandeModificationStage, {
  foreignKey: 'candidat_id',
  as: 'demandesModification',
});
DemandeModificationStage.belongsTo(Candidat, {
  foreignKey: 'candidat_id',
  as: 'candidat',
});

// RapportStage ↔ DocumentStage (1:N)
RapportStage.hasMany(DocumentStage, {
  foreignKey: 'rapport_idrapport',
  as: 'attestations',
});
DocumentStage.belongsTo(RapportStage, {
  foreignKey: 'rapport_idrapport',
  as: 'rapport',
});

// Agent ↔ DocumentStage (1:N)
Agent.hasMany(DocumentStage, {
  foreignKey: 'agents_idagents',
  as: 'documentsStage',
});
DocumentStage.belongsTo(Agent, {
  foreignKey: 'agents_idagents',
  as: 'agent',
});

// -----------------------------------------------------
// MODULE OFFRES
// -----------------------------------------------------

// Candidat ↔ Offre (1:N) - si créé par candidat
Candidat.hasMany(Offre, {
  foreignKey: 'candidats_idcandidats',
  as: 'offresCreees',
});
Offre.belongsTo(Candidat, {
  foreignKey: 'candidats_idcandidats',
  as: 'candidatCreateur',
});

// Agent ↔ Offre (1:N) - si créé par admin
Agent.hasMany(Offre, {
  foreignKey: 'agents_idagents',
  as: 'offresCreees',
});
Offre.belongsTo(Agent, {
  foreignKey: 'agents_idagents',
  as: 'agentCreateur',
});

// Direction ↔ Offre (1:N)
Direction.hasMany(Offre, { foreignKey: 'direction_iddirection', as: 'offres' });
Offre.belongsTo(Direction, { foreignKey: 'direction_iddirection', as: 'direction' });

// Offre ↔ CandidatureOffre (1:N)
Offre.hasMany(CandidatureOffre, {
  foreignKey: 'offres_idoffres',
  as: 'candidatures',
});
CandidatureOffre.belongsTo(Offre, {
  foreignKey: 'offres_idoffres',
  as: 'offre',
});

// Candidat ↔ CandidatureOffre (1:N)
Candidat.hasMany(CandidatureOffre, {
  foreignKey: 'candidats_idcandidats',
  as: 'candidaturesOffres',
});
CandidatureOffre.belongsTo(Candidat, {
  foreignKey: 'candidats_idcandidats',
  as: 'candidat',
});

// -----------------------------------------------------
// MODULE DEMANDES D'AUDIENCE
// -----------------------------------------------------

// Agent ↔ AgentNotificationPref (1:N)
Agent.hasMany(AgentNotificationPref, {
  foreignKey: 'agent_idagents',
  as: 'notificationPrefs',
});
AgentNotificationPref.belongsTo(Agent, {
  foreignKey: 'agent_idagents',
  as: 'agent',
});

// Candidat ↔ DemandeAudience (1:N)
Candidat.hasMany(DemandeAudience, {
  foreignKey: 'candidats_idcandidats',
  as: 'demandesAudience',
});
DemandeAudience.belongsTo(Candidat, {
  foreignKey: 'candidats_idcandidats',
  as: 'candidat',
});

// Direction ↔ DemandeAudience (1:N)
Direction.hasMany(DemandeAudience, {
  foreignKey: 'direction_iddirection',
  as: 'demandesAudience',
});
DemandeAudience.belongsTo(Direction, {
  foreignKey: 'direction_iddirection',
  as: 'direction',
});

// -----------------------------------------------------
// MODULE AIDES
// -----------------------------------------------------

// Candidat ↔ Aide (1:N) - si créé par candidat
Candidat.hasMany(Aide, {
  foreignKey: 'candidats_idcandidats',
  as: 'aidesCreees',
});
Aide.belongsTo(Candidat, {
  foreignKey: 'candidats_idcandidats',
  as: 'candidatCreateur',
});

// Agent ↔ Aide (1:N) - si créé par admin
Agent.hasMany(Aide, {
  foreignKey: 'agents_idagents',
  as: 'aidesCreees',
});
Aide.belongsTo(Agent, {
  foreignKey: 'agents_idagents',
  as: 'agentCreateur',
});

// Aide ↔ CandidatureAide (1:N)
Aide.hasMany(CandidatureAide, {
  foreignKey: 'aides_idaide',
  as: 'candidatures',
});
CandidatureAide.belongsTo(Aide, {
  foreignKey: 'aides_idaide',
  as: 'aide',
});

// Candidat ↔ CandidatureAide (1:N)
Candidat.hasMany(CandidatureAide, {
  foreignKey: 'candidats_idcandidats',
  as: 'candidaturesAides',
});
CandidatureAide.belongsTo(Candidat, {
  foreignKey: 'candidats_idcandidats',
  as: 'candidat',
});

// =====================================================
// EXPORTER TOUS LES MODÈLES
// =====================================================

module.exports = {
  sequelize,
  
  // Utilisateurs
  Role,
  Permission,
  User,
  Candidat,
  Direction,
  Service,
  Agent,
  UserAgent,
  UserRole,
  DirectionService,
  
  // Stage
  Stage,
  RenouvellementStage,
  RapportStage,
  DocumentStage,
  DemandeModificationStage,
  AutorisationRenouvellementStage,
  
  // Offres
  Offre,
  CandidatureOffre,
  
  // Aides
  Aide,
  CandidatureAide,

  // Demandes d'Audience
  DemandeAudience,

  // Notifications agents (préférences email)
  AgentNotificationPref,

  // Notifications in-app
  Notification,

  // Auth
  PasswordResetToken,
  RevokedToken,
  RateLimitEntry,

  // Paramètres
  AppSettings,

  // Audit
  AuditLog,

  // Sécurité
  BannedIp,
  ApiKey,

  // Email
  EmailQueue,
};