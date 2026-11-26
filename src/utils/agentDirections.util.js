// src/utils/agentDirections.util.js
// Directions d'un agent — règle UNIQUE pour tous les modules (stages, renouvellements, offres, aides,
// audiences, notifications, relances), depuis le 2026-11-26 :
//   1. les directions cochées dans sa fiche (table agents_directions, plusieurs possibles) ;
//   2. sinon les directions de son service (Agent → Service → Direction) ;
//   3. sinon la colonne historique agents.direction_iddirection.
// Avant, les stages ne lisaient que 2 et 3 : un agent à plusieurs directions ne voyait que la première.
//
// `agent` doit avoir été chargé avec INCLUDES_DIRECTIONS_AGENT (ou au moins une partie de ces includes).

const resume = (d) => ({ iddirection: d.iddirection, nom: d.nom, accronyme: d.accronyme });

const getAgentDirections = (agent) => {
  if (!agent) return [];
  if (agent.directions?.length) return agent.directions.map(resume);
  if (agent.service?.directions?.length) return agent.service.directions.map(resume);
  if (agent.directionDirecte) return [resume(agent.directionDirecte)];
  return [];
};

const getAgentDirectionIds = (agent) => getAgentDirections(agent).map(d => d.iddirection);

/** Includes Sequelize à passer au chargement d'un Agent pour getAgentDirections. */
const includesDirectionsAgent = () => {
  const { Service, Direction } = require('../models');
  const attributes = ['iddirection', 'nom', 'accronyme'];
  return [
    { model: Direction, as: 'directions', attributes, through: { attributes: [] } },
    { model: Service, as: 'service', include: [{ model: Direction, as: 'directions', attributes, through: { attributes: [] } }] },
    { model: Direction, as: 'directionDirecte', attributes },
  ];
};

/** Identifiants des directions d'un agent à partir de son id ([] si inconnu). */
const resolveAgentDirectionIds = async (agentId) => {
  if (!agentId) return [];
  const { Agent } = require('../models');
  const agent = await Agent.findByPk(agentId, { include: includesDirectionsAgent() });
  return getAgentDirectionIds(agent);
};

module.exports = { getAgentDirections, getAgentDirectionIds, includesDirectionsAgent, resolveAgentDirectionIds };
