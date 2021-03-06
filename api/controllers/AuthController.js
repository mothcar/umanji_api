import actionUtil from 'sails/lib/hooks/blueprints/actionUtil';

/**
 * AuthController
 * @description :: Server-side logic for manage users' authorization
 */

import _ from 'lodash';
import passport from 'passport';

/**
 * Sign in by email\password
 * @param req
 * @param res
 */
export function signin(req, res) {
  let params = actionUtil.parseValues(req);
  passport.authenticate('local', _.partial(sails.config.passport.onPassportAuth, req, res))(req, res);
  console.log("Paul :: ", "Sign in");
}

/**
 * Sign up by email\password
 * @param req
 * @param res
 */
export function signup(req, res) {
  let params = actionUtil.parseValues(req);
  params.type = 'USER';
  params.action = 'CREATE';

  Channel
    .findOne({email: params.email})
    .then(user => {
      if(user) {
        res.ok({});
      } else {
        Channel
          .create(params)
          .then(user => {
            return {token: CipherService.jwt.encodeSync({id: user.id}), user: user}
          })
          .then(res.created)
          .catch(res.negotiate);
      }
    })
      console.log("Paul :: ", "Sign up");

}

export function updatePassword(req, res) {
  let params = actionUtil.parseValues(req);
  params.type = 'USER';
  params.action = 'CREATE';
  console.log("Paul :: ", "update password");

  Channel
    .findOne({email: params.email})
    .then(user => {
      if(user) {
        res.ok({});
      } else {
        Channel
          .update(params)
          .then(user => {
            return {token: CipherService.jwt.encodeSync({id: user.id}), user: user}
          })
          .then(res.created)
          .catch(res.negotiate);
      }
    })
}

export function logout(req, res) {
  res.ok({});
    console.log("Paul :: ", "Log out");

}
export function checkToken(req, res) {
  let params = _.omit(req.allParams(), 'id');

  let result = {
    token: req.param('access_token'),
    user: req.user
  }
  console.log('Paul', 'AuthController :: checkToken');

  res.ok(result);
}


/**
 * Authorization via social networks
 * @param req
 * @param res
 */
export function social(req, res) {
  let type = req.param('type') ? req.param('type').toLowerCase() : '-';
  let strategyName = [type, 'token'].join('-');

  if (Object.keys(passport._strategies).indexOf(strategyName) === -1) {
    return res.badRequest(null, {message: [type, ' is not supported'].join('')});
  }

  passport.authenticate('jwt', (error, user, info) => {
    req.user = user;
    passport.authenticate(strategyName, _.partial(sails.config.passport.onPassportAuth, req, res))(req, res);
  })(req, res);
}

/**
 * Accept JSON Web Token and updates with new one
 * @param req
 * @param res
 */
export function refresh_token(req, res) {
  if (!req.param('token')) return res.badRequest(null, {message: 'You must provide token parameter'});

  let oldDecoded = CipherService.jwt.decodeSync(req.param('token'));

  res.ok({
    token: CipherService.jwt.encodeSync({id: oldDecoded.id})
  });
}
