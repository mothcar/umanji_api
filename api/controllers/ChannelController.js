import _ from 'lodash';

import policy from '../../config/services/policy';

import actionUtil from 'sails/lib/hooks/blueprints/actionUtil';
import location from '../services/LocationService';
import jsonService from '../services/JsonService';
import pusherService from '../services/PusherService';

let pusher = pusherService.android;

/**
 * ChannelController
 * @description :: Server-side logic for ...
 */

export default {
  update(req, res) {
    let params = actionUtil.parseValues(req);

    Channel
      .update(params.id, _.omit(params, 'id'))
      .then(records => records[0] ? res.ok(records[0]) : res.notFound())
      .catch(res.negotiate);
  },

  create(req, res) {
    let params = actionUtil.parseValues(req);
    params.owner = req.user.id;

    Channel
      .create(params)
      .then(channel => {
        return Channel
                .findOne(channel.id)
                .populateAll()
      })
      .then(channel => {
        return isSubChannelCreation(req, channel);
      })
      .then(isCommunityCreation)
      .then(channel => {
        res.created(channel, {parent: params.parent || null});
      })
      .catch(res.negotiate);
  },

  find(req, res) {
    let params = actionUtil.parseValues(req);
    let limit = parseLimit(params);
    let skip = parseSkip(params);
    let query = parseQuery(params);

    Channel
      .find(query)
      .limit(10)
      .skip(skip)
      .sort('createdAt DESC')
      .populateAll()
      .then(channels => {
        res.ok(channels, {parent: params.parent || params.owner || null});
      })
      .catch(res.negotiate);
  },

  get(req, res) {
    let params = actionUtil.parseValues(req);

    Channel
      .findOne(params.id)
      .populateAll()
      .then(res.ok)
      .catch(res.negotiate);
  },

  getByPoint(req, res) {
    let params = actionUtil.parseValues(req);
    location.getAddress(params)
      .then(address => {
        let query = {
          type: 'SPOT',
          address: address.address
        }

        Channel
          .findOne(query)
          .then(channel => {
            if(!channel) {
              channel = {};
              jsonService.copyAddress(channel, address);
            }
            res.ok(channel);
          })
          .catch(res.negotiate);
      })
      .catch(res.negotiate);
  },

  gcm (req, res) {
    let params = actionUtil.parseValues(req);
    let user = req.user;
    let token = params.token;

    if(_.findWhere(user.gcmTokens, token) == null){
      user.gcmTokens.push(token);
      user.save(error => {
        if(error) console.log('error', error);
        else
          console.log('user update success');
          res.ok(req.user);
      });
    }
  }
}

function parseLimit(params) {
  return params.limit || 50;
}

function parseSkip(params) {
  return params.page * 10 || 0;
}

function parseQuery(params) {
  let query = _.clone(params);
  query = _.omit(query, 'access_token')
  query = _.omit(query, 'page');
  query = _.omit(query, 'limit');

  if(query.type == 'SPOTS')        query.type = ['SPOT', 'SPOT_INNER'];
  if(query.type == 'MAIN_MARKER')  query.type = ['SPOT', 'INFO_CENTER'];
  if(query.type == 'COMMUNITY')  query.type = ['COMMUNITY', 'KEYWORD'];

  if(query.name) query.name = {'contains': query.name};
  if(query.minLatitude) {
    query.latitude = { '>=': query.minLatitude, '<=': query.maxLatitude };
    query.longitude = { '>=': query.minLongitude, '<=': query.maxLongitude };
    query = _.omit(query, ['minLatitude', 'maxLatitude', 'minLongitude', 'maxLongitude']);
  }

  if(query.level < policy.level.LOCAL) {
    query = _.omit(query, ['parent']);

    if(query.type != 'COMMUNITY') {
      query = _.omit(query, ['level']);
    }
  }

  if(query.zoom) {
    query.level = { '<=': query.zoom};
    query = _.omit(query, ['zoom']);
  }

  return query;
}

function isSubChannelCreation(req, subChannel) {
  if(!subChannel.parent) return subChannel;
  Channel
    .findOne(subChannel.parent.id)
    .populateAll()
    .then(parentChannel => {
      parentChannel.subLinks.push({
        owner: req.user.id,
        id: subChannel.id,
        type: subChannel.type
      });

      parentChannel.save();
      pusherService.channelCreated(req, parentChannel, subChannel);
    });

  return subChannel;
}

function isCommunityCreation(channel) {
  if(channel.type != 'COMMUNITY') return channel;
  let CommunityChannel = _.clone(channel);

  createLevelCommunity(CommunityChannel, policy.level.DONG, {thoroughfare: CommunityChannel.thoroughfare});
  createLevelCommunity(CommunityChannel, policy.level.GUGUN, {locality: CommunityChannel.locality})
  createLevelCommunity(CommunityChannel, policy.level.DOSI, {adminArea: CommunityChannel.adminArea})

  return channel;
}

function createLevelCommunity(CommunityChannel, level, scope) {

  let query = {
    type: 'COMMUNITY',
    name: CommunityChannel.name,
    level: level
  }
  _.merge(query, scope);

  Channel.findOne(query)
  .then(community => {
    if(!community) {
      let infoQuery = {
        type: 'INFO_CENTER',
        level: level
      }
      _.merge(infoQuery, scope);

      Channel.findOne(infoQuery)
      .then(infoCenter => {
        if(infoCenter) {
          CommunityChannel.level = level
          jsonService.copyAddress(CommunityChannel, infoCenter);

          Channel
            .create(_.omit(CommunityChannel, 'id'))
            .catch(console.log.bind(console));
        }
      })
    }
  })
}

function isAction(type) {
  const actions = ['MEMBER'];
  return ( _.indexOf(actions, type) > -1 );
}
