// src/utils/agentDirections.util.js
// Résout la/les direction(s) d'un agent, qu'il soit rattaché via un Service
// (Agent → Service → Direction, plusieurs possibles) ou directement à une
// Direction (Agent → Direction, pour les agents sans service).
//
// `agent` doit avoir été chargé avec les includes :
//   { model: Service, as: 'service', include: [{ model: Direction, as: 'directions' }] }
//   { model: Direction, as: 'directionDirecte' }

const getAgentDirections = (agent) => {
  if (!agent) return [];
  if (agent.service?.directions?.length) {
    return agent.service.directions.map(d => ({ iddirection: d.iddirection, nom: d.nom, accronyme: d.accronyme }));
  }
  if (agent.directionDirecte) {
    return [{
      iddirection: agent.directionDirecte.iddirection,
      nom: agent.directionDirecte.nom,
      accronyme: agent.directionDirecte.accronyme,
    }];
  }
  return [];
};

const getAgentDirectionIds = (agent) => getAgentDirections(agent).map(d => d.iddirection);

module.exports = { getAgentDirections, getAgentDirectionIds };
