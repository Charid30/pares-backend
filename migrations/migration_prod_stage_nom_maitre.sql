-- Migration : ajout du champ nomMaitreStage dans la table stage
-- Ce champ est renseigné obligatoirement lors de l'approbation d'une demande de stage

ALTER TABLE `stage`
  ADD COLUMN `nomMaitreStage` VARCHAR(150) NULL AFTER `dateDebutProposee`;
