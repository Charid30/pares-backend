// Test d'intégration : validatePdfFiles — vérification des magic bytes (anti
// spoofing du Content-Type) et passage au scan antivirus. Couvre les 3 formes
// que Multer peut donner à req.files (absent, tableau, ou objet groupé par champ).
jest.mock('../../services/antivirus.service');
const antivirusService = require('../../services/antivirus.service');
const { validatePdfFiles } = require('../validateFiles.middleware');

const PDF_VALIDE = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('contenu pdf')]);
const PAS_UN_PDF = Buffer.from('ceci nest pas un pdf');

const mockRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

const fichier = (buffer, overrides = {}) => ({
  fieldname: 'cv', originalname: 'document.pdf', buffer, ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  antivirusService.scanBuffer.mockResolvedValue({ clean: true, virus: null, skipped: false });
});

describe('validatePdfFiles', () => {
  test('passe sans aucun fichier', async () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    await validatePdfFiles(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(antivirusService.scanBuffer).not.toHaveBeenCalled();
  });

  test('refuse un buffer vide ou trop court', async () => {
    const req = { file: fichier(Buffer.from('ab')) };
    const res = mockRes();
    const next = jest.fn();

    await validatePdfFiles(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('refuse un fichier dont les magic bytes ne sont pas %PDF (spoofing d\'extension)', async () => {
    const req = { file: fichier(PAS_UN_PDF) };
    const res = mockRes();
    const next = jest.fn();

    await validatePdfFiles(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(antivirusService.scanBuffer).not.toHaveBeenCalled();
  });

  test('laisse passer un PDF valide et propre (req.file unique)', async () => {
    const req = { file: fichier(PDF_VALIDE) };
    const res = mockRes();
    const next = jest.fn();

    await validatePdfFiles(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(antivirusService.scanBuffer).toHaveBeenCalledTimes(1);
  });

  test('rejette un fichier détecté comme infecté par l\'antivirus', async () => {
    antivirusService.scanBuffer.mockResolvedValue({ clean: false, virus: 'EICAR-Test-File', skipped: false });
    const req = { file: fichier(PDF_VALIDE) };
    const res = mockRes();
    const next = jest.fn();

    await validatePdfFiles(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
  });

  test('laisse passer si le scan est "skipped" (ClamAV indisponible, mode non strict)', async () => {
    antivirusService.scanBuffer.mockResolvedValue({ clean: true, virus: null, skipped: true });
    const req = { file: fichier(PDF_VALIDE) };
    const res = mockRes();
    const next = jest.fn();

    await validatePdfFiles(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('ne fait jamais planter l\'upload si l\'antivirus lève une erreur inattendue', async () => {
    antivirusService.scanBuffer.mockRejectedValue(new Error('Erreur ClamAV inattendue'));
    const req = { file: fichier(PDF_VALIDE) };
    const res = mockRes();
    const next = jest.fn();

    await validatePdfFiles(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('valide chaque fichier d\'un tableau req.files (upload.array)', async () => {
    const req = { files: [fichier(PDF_VALIDE, { fieldname: 'a' }), fichier(PAS_UN_PDF, { fieldname: 'b' })] };
    const res = mockRes();
    const next = jest.fn();

    await validatePdfFiles(req, res, next);

    // Le 2e fichier (invalide) doit bloquer toute la requête.
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('valide chaque fichier d\'un objet req.files groupé par champ (upload.fields)', async () => {
    const req = { files: { cv: [fichier(PDF_VALIDE, { fieldname: 'cv' })], cnib: [fichier(PDF_VALIDE, { fieldname: 'cnib' })] } };
    const res = mockRes();
    const next = jest.fn();

    await validatePdfFiles(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(antivirusService.scanBuffer).toHaveBeenCalledTimes(2);
  });
});
