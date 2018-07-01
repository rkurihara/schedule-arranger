'use strict';
const expreess = require('express');
const router = expreess.Router();
const authenticationEnsurer = require('./authentication-ensurer');

router.get('/new', authenticationEnsurer, (req, res, next) => {
  res.render('new', { user: req.user });
});

router.post('/', authenticationEnsurer, (req, res, next) => {
  console.log(req.body);
  res.redirect('/');
});

module.exports = router;