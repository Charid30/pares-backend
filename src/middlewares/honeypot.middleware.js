module.exports = (req, res, next) => {
  if (req.body && req.body.website) {
    return res.status(200).json({ success: true, message: 'Inscription en cours de traitement.' });
  }
  next();
};
