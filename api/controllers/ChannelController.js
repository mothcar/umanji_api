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
 * server coder : Paul Hwang for Git test
 */

export default {

  findComplexSpots(req, res) {
    let params = actionUtil.parseValues(req);
    params = _.omit(params, 'access_token')

    Channel
      .findOne(params.id)
      .then(channel => {
        let subChannelIds = _.pluck(channel.subLinks, 'id');

        Channel
          .find({id: subChannelIds})
          .populateAll()
          .then(res.ok)
      })

  },

  link(req, res) {
    let params = actionUtil.parseValues(req);
    params.action = 'LINK';

    Channel
      .findOne(params.parent)
      .populateAll()
      .then(parentChannel => {
        parentChannel.subLinks.push({
          owner: params.owner,
          id: params.id,
          type: params.type,
          name: params.name
        });

        parentChannel.point = parentChannel.point + policy.point.LINK;
        return parentChannel.save();
      })
      .then(res.ok)
  },

  home(req, res) {
    let params = actionUtil.parseValues(req);
    if(!params.id) {
      res.badRequest();
      return;
    }
  },

  update(req, res) {
    let params = actionUtil.parseValues(req);
    params.action = 'UPDATE';
    console.log("Paul  ****************************", "update");
    if(!params.id) {
      res.badRequest();
      return;
    }

    params = _.omit(params, 'access_token');

    Channel
      .update(params.id, _.omit(params, 'id'))
      .then(records => {
        var channel = records[0];
        _.forEach(channel.keywords, function(name) {
          let keywordCommunityChannel = {};
          jsonService.copyAddress(keywordCommunityChannel, channel);
          keywordCommunityChannel.type = 'KEYWORD_COMMUNITY';
          keywordCommunityChannel.name = name;
          createKeywordCommunities(keywordCommunityChannel)
        });

        res.ok(channel);
      })
      .catch(res.negotiate);
  },

  updatePassword(req, res) {
    let params = actionUtil.parseValues(req);
    params.action = 'UPDATE';
    // console.log("Paul  ****************************11", params);
    if(!params.id) {
      res.badRequest();
      return;
    }

    params = _.omit(params, 'access_token');

    Channel
      .update(params.id, _.omit(params, 'id'))
      .then(records => {
        var channel = records[0];

        res.ok(channel);
      })
      .catch(res.negotiate);
  },

  updateRole(req, res) {
    let params = actionUtil.parseValues(req);
    if(!params.email) {
      res.badRequest();
      return;
    }

    params = _.omit(params, 'access_token');

    Channel
      .update({email: params.email}, _.omit(params, 'email'))
      .then(records => {
        // console.log('records[0]', records[0])
        records[0] ? res.ok(records[0]) : res.notFound();
      })
      .catch(res.negotiate);
  },

  unJoin(req, res) {
    let params = actionUtil.parseValues(req);
    params.action = 'UN_JOIN';
    this.delete(req, res, params);
  },

  unLike(req, res) {
    let params = actionUtil.parseValues(req);
    params.action = 'UN_LIKE';

    this.delete(req, res, params);
  },

  deleteChannel(req, res) {
    let params = actionUtil.parseValues(req);
    params.action = 'DELETE';

    this.delete(req, res, params);
  },

  delete(req, res, params) {
    let parentId = params.parent;

    if(!params.id) {
      res.badRequest();
      return;
    }

    Channel
      .destroy({id: params.id})
      .then(channels => {

        // for backup
        let channel = _.omit(channels[0], 'id');
        channel.channelId = channels[0].id;
        channel.status = 'DELETED';
        Backup
          .create(channel)
          .catch(console.log.bind(console));


        Channel
          .update({id: req.user.id}, {point: req.user.point - policy.point.DELETE_CHANNEL})
          .catch(console.log.bind(console));

        if(channels[0].id) {
          Channel
            .destroy({parent: channels[0].id})
            .then(deletedChannels => {

              // for backup
              _.forEach(deletedChannels, (deletedChannel) => {
                let channel = _.omit(deletedChannel, 'id');
                channel.channelId = deletedChannel.id;
                channel.status = 'DELETED';
                Backup
                  .create(channel)
                  .catch(console.log.bind(console));
              })
            })
            .catch(console.log.bind(console));
        }


        if(parentId) {
          Channel
            .findOne({id: parentId})
            .then(parent => {
              _.remove(parent.subLinks, {
                  id: params.id
              });

              parent.point = parent.point - policy.point.DELETE_CHANNEL;
              parent.save();
              res.ok(parent, {parent: params.parent || null});
            })
        }else {
          res.ok(channels[0]);
        }
      })
  },

  vote(req, res) {
    let params = actionUtil.parseValues(req);
    params.action = 'VOTE';
    this.create(req, res, params);
  },

  createKeyword(req, res) {
    let params = actionUtil.parseValues(req);
    params.action = 'CREATE';

    Channel
      .findOne(params.id)
      .then(channel => {
        let keywordCommunityChannel = {};
        jsonService.copyAddress(keywordCommunityChannel, channel);
        keywordCommunityChannel.type = 'KEYWORD_COMMUNITY';
        keywordCommunityChannel.name = params.name;
        createKeywordCommunities(keywordCommunityChannel)

        if(channel.keywords.length < 2 && _.findWhere(channel.keywords, params.name) == null) {
          channel.keywords.push(params.name);
          Channel
            .update(params.id, {keywords: channel.keywords})
            .then(records => {
              records[0] ? res.ok(records[0]) : res.notFound();
            })
        } else {
          res.ok(channel)
        }
      })
      .catch(error => {
        console.log('error', error);
        res.negotiate(error)
      })
  },

  deleteKeyword(req, res) {
    let params = actionUtil.parseValues(req);
    params.action = 'DELETE';

    Channel
      .findOne(params.id)
      .then(channel => {
        _.pull(channel.keywords, params.name);

        Channel
          .update(params.id, {keywords: channel.keywords})
          .then(res.ok)
      })
      .catch(res.negotiate)
  },

  createCommunity(req, res) {
    let params = actionUtil.parseValues(req);
    params.action = 'CREATE';
    this.create(req, res, params);
  },

  DEPRECIATED_createCommunity(req, res) {
    let params = actionUtil.parseValues(req);
    params.action = 'CREATE';
    const level = params.level;

    let parentType = params.parentType;
    params = _.omit(params, 'parentType');

    if(parentType != 'INFO_CENTER') {
      this.create(req, res, params);
    } else {
      let communityChannel = {}
      jsonService.copyAddress(communityChannel, params);
      communityChannel.owner = req.user.id;
      communityChannel.level = params.level;
      communityChannel.name = params.name;
      communityChannel.type = 'COMMUNITY';

      switch (communityChannel.level) {
        case policy.level.DONG:
          createLevelCommunity(communityChannel, policy.level.DONG, {thoroughfare: communityChannel.thoroughfare})
            .then(channel => {

              if(channel) {
                  Channel
                    .findOne(channel.id)
                    .populateAll()
                    .then(channel => {
                        res.created(channel, {parent: params.parent || null});
                    })
              }else {
                res.ok({}, {parent: params.parent || null});
              }

            });

          createLevelCommunity(communityChannel, policy.level.GUGUN, {locality: communityChannel.locality})
          createLevelCommunity(communityChannel, policy.level.DOSI, {adminArea: communityChannel.adminArea})
          createLevelCommunity(communityChannel, policy.level.CONTRY, {countryCode: communityChannel.countryCode})
          break;

        case policy.level.GUGUN:
          createLevelCommunity(communityChannel, policy.level.GUGUN, {locality: communityChannel.locality})
            .then(channel => {

              if(channel) {
                  Channel
                    .findOne(channel.id)
                    .populateAll()
                    .then(channel => {
                        res.created(channel, {parent: params.parent || null});
                    })
              }else {
                res.ok({}, {parent: params.parent || null});
              }

            });

          createLevelCommunity(communityChannel, policy.level.DOSI, {adminArea: communityChannel.adminArea})
          createLevelCommunity(communityChannel, policy.level.CONTRY, {countryCode: communityChannel.countryCode})
          break;

        case policy.level.DOSI:
          createLevelCommunity(communityChannel, policy.level.DOSI, {adminArea: communityChannel.adminArea})
            .then(channel => {

              if(channel) {
                  Channel
                    .findOne(channel.id)
                    .populateAll()
                    .then(channel => {
                      res.created(channel, {parent: params.parent || null});
                    })
              }else {
                res.ok({}, {parent: params.parent || null});
              }

            });
          createLevelCommunity(communityChannel, policy.level.CONTRY, {countryCode: communityChannel.countryCode})
          break;

        case policy.level.CONTRY:
          createLevelCommunity(communityChannel, policy.level.CONTRY, {countryCode: communityChannel.countryCode})
            .then(channel => {

              if(channel) {
                  Channel
                    .findOne(channel.id)
                    .populateAll()
                    .then(channel => {
                        res.created(channel, {parent: params.parent || null});
                    })
              }else {
                res.ok({}, {parent: params.parent || null});
              }

            });
          break;
      }
    }
  },

  join(req, res) {
    let params = actionUtil.parseValues(req);
    params.action = 'JOIN';

    this.create(req, res, params);
  },

  like(req, res) {
    let params = actionUtil.parseValues(req);
    params.action = 'LIKE';

    this.create(req, res, params);
  },

  createChannel(req, res) {
    let params = actionUtil.parseValues(req);
    params.action = 'CREATE';

    this.create(req, res, params);
  },

  create(req, res, params) {
    let push = params.push;
    let sub_type = params.sub_type;
    let sub_name = params.sub_name;
    let sub_point = params.sub_point;
    params.owner = req.user.id;

    if(params.type == 'POST') {
      console.log('Paul ::', 'create type');

    }

    Channel
      .create(params)
      .then(channel => {

        Channel
          .update({id: req.user.id}, {point: req.user.point + policy.point.CREATE_CHANNEL})
          .catch(console.log.bind(console));

        return Channel
                .findOne(channel.id)
                .populateAll()
      })
      .then(channel => {       
          // parentChannel.save();
          // channel.owner = parentChannel;
          // return channel;

          isExpertCreation(req, channel, sub_type, sub_name, sub_point);
          return isSubChannelCreation(req, channel, push);
        
      })
      .then(channel => {

        _.forEach(channel.keywords, function(name) {
          let keywordCommunityChannel = {};
          jsonService.copyAddress(keywordCommunityChannel, channel);
          keywordCommunityChannel.type = 'KEYWORD_COMMUNITY';
          keywordCommunityChannel.name = name;
          createKeywordCommunities(keywordCommunityChannel)
        });

        res.created(channel, {parent: params.parent || null});
      })
      .catch(res.negotiate);
  },


  createManager(req, res) {
    let params = actionUtil.parseValues(req);
    params.action = 'CREATE';

    let sub_type = params.sub_type;
    let sub_name = params.sub_name;

console.log("Paul - sub-name :: ", sub_name);

    Channel
      .findOne(params.owner)
      .populateAll()
      .then(channel => {       

        channel.subLinks.push({
        owner: params.owner,
        id: params.owner,
        type: sub_type,
        name: sub_name,
      });

      channel.save();

      // channel.owner = parentChannel;
      return channel;
        
      })
   
  },

// Paul did it :: new community find on bottom
findBottomChannels(req, res) {
    let params = actionUtil.parseValues(req);

    let limit = parseLimit(params);
    let skip = parseSkip(params);
    let sort = parseSort(params);
    let distinct = parseDistinct(params);
    let query = parseQuery(params);
    //query.level = 2;

    Channel
      .find(query)
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .populateAll()
      .then(channels => {
        if(distinct) {
          channels = _.uniq(channels, distinct);
        }
        res.ok(channels, {parent: params.parent || params.owner || null});
      })
      .catch(res.negotiate);
  }, 

// findBottomChannels
/* original
if(distinct) {
          channels = _.uniq(channels, distinct);
        }
        res.ok(channels, {parent: params.parent || params.owner || null});


*/
/*
params.type = ['SPOT', 'INFO_CENTER', 'COMPLEX'];

        this.find(req, res, params);
console.log("Paul did +++++++++++++++++++++++++++++++", "done");

*/

// Paul test for create keyword into user subLinks data :: start
  
updateToExpert(req, res) {
    let params = actionUtil.parseValues(req);
    params.action = 'UPDATE';
    if(!params.id) {
      res.badRequest();
      return;
    }

    params = _.omit(params, 'access_token');

    // console.log("Paul log +++++++++++++++++++++++++++++++++++++ I am Here and Param is ", params);
    // console.log("Paul log +++++++++++++++++++++++++++++++++++++ channel.subLinks", channel);


    Channel
      .update(params.id, _.omit(params, 'id'))
      .then(records => {
        


        var channel = records[0];
        _.forEach(channel.subLinks, function(subLinks) {
          channel.subLinks.push({
          owner: req.user.id,
          id: '500',
          type: subLinks.sub_type,
          name: subLinks.sub_name
        });
        });

        res.ok(channel);
      })
      .catch(res.negotiate);

      
  },
// Paul test for create keyword into user subLinks data :: end





  findProfilePosts(req, res) {
    let params = actionUtil.parseValues(req);
    params.type = 'POST';
    this.find(req, res, params);
  },

  findDistributions(req, res) {
    let params = actionUtil.parseValues(req);
    let query = parseQuery(params);

    // console.log('findDistributions: params', query);

    Channel
      .find(query)
      .limit(30)
      .sort('point DESC')
      .populateAll()
      .then(res.ok)
      .catch(res.negotiate);
  },

  findMainMarkers(req, res) {
    let params = actionUtil.parseValues(req);
    params.type = ['SPOT', 'INFO_CENTER', 'COMPLEX'];

    this.find(req, res, params);
  },

  findMainAds2(req, res) {
    let params = actionUtil.parseValues(req);
    params.type = 'ADVERTISE';

    this.find(req, res, params);
  },

// Paul did it on 160724
  findStaff(req, res) {
    let params = actionUtil.parseValues(req);
    params.type = 'INFO_CENTER';

    this.find(req, res, params);
  },

  // findMainAds
  findMainAds(req, res) {
    let params = actionUtil.parseValues(req);
    let query = _.omit(params, 'access_token');

    query.type = 'ADVERTISE';

    if(query.minLatitude) {
      query.latitude = { '>=': query.minLatitude, '<=': query.maxLatitude };
      query.longitude = { '>=': query.minLongitude, '<=': query.maxLongitude };
      query = _.omit(query, ['minLatitude', 'maxLatitude', 'minLongitude', 'maxLongitude']);
    }

    Channel
      .find(query)
      .populateAll()
      .then(channels => {
        res.ok(channels);
      })
      .catch(res.negotiate);
  },


  findKeywordPosts(req, res) {
    let params = actionUtil.parseValues(req);
    params.type = 'POST';
    this.find(req, res, params);
  },

  findKeywordChannels(req, res) {
    let params = actionUtil.parseValues(req);
    params.type = ['SPOT', 'COMMUNITY', 'SPOT_INNER', 'COMPLEX'];
    this.find(req, res, params);
  },

  findMainPosts(req, res) {
    let params = actionUtil.parseValues(req);
    params.type = 'POST';
    this.find(req, res, params);
  },

  findPosts(req, res) {
    let params = actionUtil.parseValues(req);
    params.type = 'POST';
    this.find(req, res, params);
  },

  findSpots(req, res) {
    let params = actionUtil.parseValues(req);
    this.find(req, res, params);
  },

  findMembers(req, res) {
    let params = actionUtil.parseValues(req);
    this.find(req, res, params);
  },

  findNewCommunities(req, res) {
    let params = actionUtil.parseValues(req);
    let query = _.omit(params, 'level');
    this.find(req, res, params);
  },

  findBottomCommunities(req, res) {
    let params = actionUtil.parseValues(req);
    params.type = ['SPOT', 'SPOT_INNER', 'COMPLEX'];

    this.find(req, res, params);
  },

  findCommunities(req, res) {
    let params = actionUtil.parseValues(req);

    let limit = parseLimit(params);
    let skip = parseSkip(params);
    let sort = parseSort(params);
    let distinct = parseDistinct(params);
    let query = parseQuery(params);
    //query.level = 2;

    Channel
      .find(query)
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .populateAll()
      .then(channels => {
        if(distinct) {
          channels = _.uniq(channels, distinct);
        }
        res.ok(channels, {parent: params.parent || params.owner || null});
      })
      .catch(res.negotiate);
  },

  findChannels(req, res) {
    let params = actionUtil.parseValues(req);
    this.find(req, res, params);
  },

  findCommunity(req, res) {
    let params = actionUtil.parseValues(req);
    let query = _.omit(params, 'access_token');
    query.type = 'KEYWORD_COMMUNITY';
    if(!query.level) {
      query.level = 2;
    }

    Channel
      .findOne(query)
      .populateAll()
      .then(res.ok)
      .catch(res.negotiate);
  },

  search(req, res) {
    let params = actionUtil.parseValues(req);
    this.find(req, res, params);
  },

  find(req, res, params) {
    let limit = parseLimit(params);
    let skip = parseSkip(params);
    let sort = parseSort(params);
    let distinct = parseDistinct(params);
    let query = parseQueryFull(params);

    // console.log('findPosts', query);

    Channel
      .find(query)
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .populateAll()
      .then(channels => {
        if(distinct) {
          channels = _.uniq(channels, distinct);
        }
        res.ok(channels, {parent: params.parent || params.owner || null});
      })
      .catch(res.negotiate);
  },

  findOne(req, res) {
    let params = actionUtil.parseValues(req);
    let query = _.omit(params, 'access_token');

    Channel
      .findOne(query)
      .populateAll()
      .then(res.ok)
      .catch(res.negotiate);
  },

  findEmail(req, res) {
    let params = actionUtil.parseValues(req);

    Channel
      .findOne({email :params.email})
      .populateAll()
      .then(res.ok)
      .catch(res.negotiate);
  },

  findRole (req, res) {
    let params = actionUtil.parseValues(req);

    Channel
      .findOne(params.owner)
      .populateAll()
      .then(res.ok)
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
          res.ok(req.user);
      });
    }
  }
}

function parseLimit(params) {
  return params.limit || 15;
}

function parseSkip(params) {
  let limit = params.limit || 15;
  return params.page * limit || 0;
}

function parseSort(params) {
  if(params.type == 'SPOT_INNER') {
    params.sort = 'desc.floor ASC';
  }

  return params.sort || 'updatedAt DESC';
}

function parseDistinct(params) {
  return params.distinct;
}

function parseQuery(params) {
  let query = _.clone(params);
  query = _.omit(query, 'access_token')
  query = _.omit(query, 'page');
  query = _.omit(query, 'limit');
  query = _.omit(query, 'sort');
  query = _.omit(query, 'distinct');

  if(query.minLatitude) {
    query.latitude = { '>=': query.minLatitude, '<=': query.maxLatitude };
    query.longitude = { '>=': query.minLongitude, '<=': query.maxLongitude };
    query = _.omit(query, ['minLatitude', 'maxLatitude', 'minLongitude', 'maxLongitude']);
  }

  return query;
}

function parseQueryFull(params) {
  let query = _.clone(params);
  query = _.omit(query, 'access_token')
  query = _.omit(query, 'page');
  query = _.omit(query, 'limit');
  query = _.omit(query, 'sort');
  query = _.omit(query, 'distinct');

  if(query.name) query.name = {'contains': query.name};
  if(query.minLatitude) {
    query.latitude = { '>=': query.minLatitude, '<=': query.maxLatitude };
    query.longitude = { '>=': query.minLongitude, '<=': query.maxLongitude };
    query = _.omit(query, ['minLatitude', 'maxLatitude', 'minLongitude', 'maxLongitude']);
  }

  if(query.level < policy.level.LOCAL) {
    if(query.type != 'COMMUNITY') {
      query = _.omit(query, ['level']);
    }
  }

  if(query.zoom) {
    query.level = { '<=': query.zoom};
    query = _.omit(query, ['zoom']);
  }

  if(query.parentType == 'INFO_CENTER' || query .parentType == 'SPOT') {
    query = _.omit(query, ['parentType']);
    query = _.omit(query, ['parent']);
  }

  if(query.type == 'SPOTS')        query.type = ['SPOT', 'SPOT_INNER'];
  if(query.type == 'MAIN_MARKER')  query.type = ['SPOT', 'INFO_CENTER', 'COMPLEX'];

  if(query.type == 'PROFILE_SPOTS') {
    query.type = ['SPOT', 'SPOT_INNER'];
    query.or = [{'owner': query.owner}, {'subLinks.owner': query.owner}];
    query = _.omit(query, ['owner']);
  }

  if(query.type == 'PROFILE_COMMUNITIES') {
    query.type = ['COMMUNITY', 'COMPLEX'];
    query.or = [{'owner': query.owner}, {'subLinks.owner': query.owner}];
    query = _.omit(query, ['owner', 'level']);
  }

  if(query.parentType == 'ADVERTISE') {
    query = _.omit(query, ['parentType']);
    query = _.omit(query, ['parent']);
  }

  return query;
}

function isSubChannelCreation(req, subChannel, push) {
  if(!subChannel.parent) return subChannel;

  return Channel
    .findOne(subChannel.parent.id)
    .populateAll()
    .then(parentChannel => {
      parentChannel.subLinks.push({
        owner: req.user.id,
        id: subChannel.id,
        type: subChannel.type,
        name: subChannel.name
      });

      parentChannel.point = parentChannel.point + policy.point.CREATE_CHANNEL;
      parentChannel.save();
      pusherService.channelCreated(req, parentChannel, subChannel, push);

      subChannel.parent = parentChannel;
      return subChannel;
    });
}
//  Paul did it :: 2016 07 19
function isExpertCreation(req, channel, sub_type, sub_name, sub_point) {
  // console.log("Paul parentChannel +++++++++++++++++++++++++++ ::", "I'm Here!!!");
  // if(!subChannel.parent) return subChannel;

  return Channel
    // .findOne(subChannel.parent.id)
    .findOne(channel.owner.id)
    .populateAll()
    .then(parentChannel => {
      // console.log("Paul parentChannel +++++++++++++++++++++++++++ ::", channel);
      parentChannel.subLinks.push({
        owner: req.user.id,
        id: req.user.id,
        type: sub_type,
        name: sub_name,
        point: sub_point
      });

      parentChannel.save();

      channel.owner = parentChannel;
      return channel;
    });
}

function isManagerCreation(req, channel, sub_type, sub_name) {

  return Channel
    .findOne(channel.owner.id)
    .populateAll()
    .then(channel => {
      // console.log("Paul parentChannel +++++++++++++++++++++++++++ ::", channel);
        channel.subLinks.push({
        owner: req.user.id,
        id: req.user.id,
        type: sub_type,
        name: sub_name,
      });

      channel.save();

      // channel.owner = parentChannel;
      return channel;
    });
}

function createKeywordCommunities(communityChannel) {
  createKeywordCommunity(communityChannel, policy.level.DONG, {adminArea: communityChannel.adminArea, locality: communityChannel.locality, thoroughfare: communityChannel.thoroughfare});
  createKeywordCommunity(communityChannel, policy.level.GUGUN, {adminArea: communityChannel.adminArea, locality: communityChannel.locality})
  createKeywordCommunity(communityChannel, policy.level.DOSI, {adminArea: communityChannel.adminArea})
  createKeywordCommunity(communityChannel, policy.level.CONTRY, {countryCode: communityChannel.countryCode})
}

function isCommunityCreation(channel) {
  if(channel.type != 'COMMUNITY' && channel.type != 'KEYWORD') return channel;
  let communityChannel = _.clone(channel);

  switch (communityChannel.level) {
    case policy.level.LOCAL:
    case policy.level.COMPLEX:
    case policy.level.DONG:
      createLevelCommunity(communityChannel, policy.level.DONG, {adminArea: communityChannel.adminArea, locality: communityChannel.locality, thoroughfare: communityChannel.thoroughfare});
    case policy.level.GUGUN:
      createLevelCommunity(communityChannel, policy.level.GUGUN, {adminArea: communityChannel.adminArea, locality: communityChannel.locality})
    case policy.level.DOSI:
      createLevelCommunity(communityChannel, policy.level.DOSI, {adminArea: communityChannel.adminArea})
    case policy.level.CONTRY:
      createLevelCommunity(communityChannel, policy.level.CONTRY, {countryCode: communityChannel.countryCode})
      break;
  }

  return channel;
}

function createKeywordCommunity(communityChannel, level, scope) {
  let query = {
    type: 'KEYWORD_COMMUNITY',
    name: communityChannel.name,
    level: level
  }
  _.merge(query, scope);

  return Channel.findOne(query)
    .then(community => {
      // console.log('createKeywordCommunity');
      if(!community) {
        // console.log('KEYWORD_COMMUNITY NOT found');
        let infoQuery = {
          type: 'INFO_CENTER',
          level: level
        }
        _.merge(infoQuery, scope);

        return Channel.findOne(infoQuery)
        .then(infoCenter => {
          if(infoCenter) {
            communityChannel.level = level
            jsonService.copyAddress(communityChannel, infoCenter);
            communityChannel.parent = infoCenter.id;
            communityChannel.keywords = communityChannel.name

            return Channel
              .create(_.omit(communityChannel, 'id'))
              .catch(console.log.bind(console));
          }
        })
      } else {
        return null;
      }
    })
}

function createLevelCommunity(communityChannel, level, scope) {
  let query = {
    type: 'COMMUNITY',
    name: communityChannel.name,
    level: level
  }
  _.merge(query, scope);


  return Channel.findOne(query)
    .then(community => {
      if(!community) {
        let infoQuery = {
          type: 'INFO_CENTER',
          level: level
        }
        _.merge(infoQuery, scope);

        return Channel.findOne(infoQuery)
        .then(infoCenter => {
          if(infoCenter) {
            communityChannel.level = level
            jsonService.copyAddress(communityChannel, infoCenter);
            communityChannel.type = 'COMMUNITY';
            communityChannel.parent = infoCenter.id;

            return Channel
              .create(_.omit(communityChannel, 'id'))
              .catch(console.log.bind(console));
          }
        })
      } else {
        return null;
      }
    })
}

function isAction(type) {
  const actions = ['MEMBER'];
  return ( _.indexOf(actions, type) > -1 );
}
