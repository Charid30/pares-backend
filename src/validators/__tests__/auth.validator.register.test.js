// Le schéma d'inscription supprime tout champ qu'il ne déclare pas (stripUnknown) : le genre et le récépissé doivent y figurer.
const validate = require('../../middlewares/validate.middleware');
const { registerSchema } = require('../auth.validator');

const INSCRIPTION = {
  username: 'awa.ouedraogo',
  password: 'MotDePasse1',
  confirmPassword: 'MotDePasse1',
  nom: 'OUEDRAOGO',
  prenom: 'Awa',
  genre: 'FEMME',
  email: 'awa@exemple.bf',
  telephone: '70000001',
  nip: '12345678901234567',
};

const valider = (corps) => {
  const req = { body: { ...corps } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  validate(registerSchema)(req, res, next);
  return { req, res, next };
};

describe('registerSchema', () => {
  test('le genre et le récépissé arrivent jusqu\'au service', () => {
    const { req, next } = valider({ ...INSCRIPTION, recipisse: 'REC-2026-001' });

    expect(next).toHaveBeenCalled();
    expect(req.body.genre).toBe('FEMME');
    expect(req.body.recipisse).toBe('REC-2026-001');
  });

  test.each([[undefined], ['AUTRE'], ['']])('genre %p : refusé', (genre) => {
    const { res, next } = valider({ ...INSCRIPTION, genre });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
