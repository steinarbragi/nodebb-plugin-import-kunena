
var async = require('async');
var mysql = require('mysql');
var _ = require('underscore');
var noop = function(){};
var logPrefix = '[nodebb-plugin-import-kunena]';

(function(Exporter) {

    Exporter.setup = function(config, callback) {
        Exporter.log('setup');

        // mysql db only config
        // extract them from the configs passed by the nodebb-plugin-import adapter
        var _config = {
            host: config.dbhost || config.host || 'localhost',
            user: config.dbuser || config.user || 'root',
            password: config.dbpass || config.pass || config.password || 'root',
            port: config.dbport || config.port || 8889,
            database: config.dbname || config.name || config.database || 'kunena'
        };

        Exporter.config(_config);
        Exporter.config('prefix', config.prefix || config.tablePrefix || 'i25V3_');

        Exporter.connection = mysql.createConnection(_config);
        Exporter.connection.connect();
        
        /* Debugging mysql connection errors
        var del = Exporter.connection._protocol._delegateError;
        Exporter.connection._protocol._delegateError = function(err, sequence){
          if (err.fatal) {
            console.trace('fatal error: ' + err.message);
          }
          return del.call(this, err, sequence);
        }; */

        callback(null, Exporter.config());
    };

    Exporter.getUsers = function(callback) {
        return Exporter.getPaginatedUsers(0, -1, callback);
    };
    Exporter.getPaginatedUsers = function(start, limit, callback) {
        callback = !_.isFunction(callback) ? noop : callback;

        var err;
        var prefix = Exporter.config('prefix');
        var startms = +new Date();
        var query = 'SELECT '
            + prefix + 'users.id as _uid, '
            + prefix + 'users.username as _username, '
            + prefix + 'users.name as _alternativeUsername, '
            + prefix + 'users.email as _registrationEmail, '
            //+ prefix + 'USERS.USER_MEMBERSHIP_LEVEL as _level, '
            + prefix + 'users.registerDate as _joindate, '
            + prefix + 'users.block as _banned, '
            + prefix + 'users.email as _email '
            //+ prefix + 'USER_PROFILE.USER_SIGNATURE as _signature, '
            //+ prefix + 'USER_PROFILE.USER_HOMEPAGE as _website, '
            //+ prefix + 'USER_PROFILE.USER_OCCUPATION as _occupation, '
            //+ prefix + 'USER_PROFILE.USER_LOCATION as _location, '
            //+ prefix + 'USER_PROFILE.USER_AVATAR as _picture, '
            //+ prefix + 'USER_PROFILE.USER_TITLE as _title, '
            //+ prefix + 'USER_PROFILE.USER_RATING as _reputation, '
            //+ prefix + 'USER_PROFILE.USER_TOTAL_RATES as _profileviews, '
            //+ prefix + 'USER_PROFILE.USER_BIRTHDAY as _birthday '

            + 'FROM ' + prefix + 'users ' //, ' + prefix + 'USER_PROFILE '
            //+ 'WHERE ' + prefix + 'users.id = ' + prefix + 'USER_PROFILE.USER_ID '
            + (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');


        if (!Exporter.connection) {
            err = {error: 'MySQL connection is not setup. Run setup(config) first'};
            Exporter.error(err.error);
            return callback(err);
        }

        Exporter.connection.query(query,
            function(err, rows) {
                if (err) {
                    Exporter.error(err);
                    return callback(err);
                }

                //normalize here
                var map = {};
                rows.forEach(function(row) {
                    // nbb forces signatures to be less than 150 chars
                    // keeping it HTML see https://github.com/akhoury/nodebb-plugin-import#markdown-note
                    row._signature = Exporter.truncateStr(row._signature || '', 150);
                    row._joindate = (row._joindate.getTime() || 0) || startms;
                    // lower case the email for consistency
                    row._email = (row._email || '').toLowerCase();
                    // I don't know about you about I noticed a lot my users have incomplete urls, urls like: http://
                    row._picture = Exporter.validateUrl(row._picture);
                    row._website = Exporter.validateUrl(row._website);
    
                    map[row._uid] = row;
                });

                callback(null, map);
            });
    };


    Exporter.getCategories = function(callback) {
        return Exporter.getPaginatedCategories(0, -1, callback);    
    };
    Exporter.getPaginatedCategories = function(start, limit, callback) {
        callback = !_.isFunction(callback) ? noop : callback;

        var err;
        var prefix = Exporter.config('prefix');
        var startms = +new Date();
        var query = 'SELECT '
            + prefix + 'kunena_categories.id as _cid, '
            + prefix + 'kunena_categories.name as _name, '
            + prefix + 'kunena_categories.description as _description '
            + 'FROM ' + prefix + 'kunena_categories '
            + (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');


        if (!Exporter.connection) {
            err = {error: 'MySQL connection is not setup. Run setup(config) first'};
            Exporter.error(err.error);
            return callback(err);
        }

        Exporter.connection.query(query,
            function(err, rows) {
                if (err) {
                    Exporter.error(err);
                    return callback(err);
                }

                //normalize here
                var map = {};
                rows.forEach(function(row) {
                    row._name = row._name || 'Untitled Category '
                    row._description = row._description || 'No decsciption available';
                    row._timestamp = ((row._timestamp || 0) * 1000) || startms;
    
                    map[row._cid] = row;
                });

                callback(null, map);
            });
    };

    Exporter.getTopics = function(callback) {
        return Exporter.getPaginatedTopics(0, -1, callback);
    };
    Exporter.getPaginatedTopics = function(start, limit, callback) {
        callback = !_.isFunction(callback) ? noop : callback;

        var err;
        var prefix = Exporter.config('prefix');
        var startms = +new Date();
        var query =
            'SELECT '
            + prefix + 'kunena_topics.id as _tid, '

            // aka category id, or cid
            + prefix + 'kunena_topics.category_id as _cid, '

            // this is the 'parent-post'
            // see https://github.com/akhoury/nodebb-plugin-import#important-note-on-topics-and-posts
            // I don't really need it since I just do a simple join and get its content, but I will include for the reference
            // remember: this post is EXCLUDED in the getPosts() function
            + prefix + 'kunena_topics.first_post_id as _pid, '

            + prefix + 'kunena_user_topics.user_id as _uid, '
            + prefix + 'kunena_topics.hits as _viewcount, '
            + prefix + 'kunena_topics.subject as _title, '
            + prefix + 'kunena_topics.first_post_time as _timestamp, '

            // maybe use that to skip
            //+ prefix + 'TOPICS.TOPIC_IS_APPROVED as _approved, '

            // todo:  figure out what this means,
            //+ prefix + 'TOPICS.TOPIC_STATUS as _status, '

            //+ prefix + 'TOPICS.TOPIC_IS_STICKY as _pinned, '

            // I dont need it, but if it should be 0 per UBB logic, since this post is not replying to anything, it's the parent-post of the topic
            //+ prefix + 'POSTS.POST_PARENT_ID as _post_replying_to, '

            // this should be == to the _tid on top of this query
            + prefix + 'kunena_topics.id as _post_tid, '

            // and there is the content I need !!
            + prefix + 'kunena_topics.first_post_message as _content '

            + 'FROM ' + prefix + 'kunena_topics, ' + prefix + 'kunena_user_topics '
            + 'WHERE ' + prefix + 'kunena_topics.id=' + prefix + 'kunena_user_topics.topic_id '
            // see
            //+ 'WHERE ' + prefix + 'TOPICS.TOPIC_ID=' + prefix + 'POSTS.TOPIC_ID '
            // and this one must be a parent
            //+ 'AND ' + prefix + 'POSTS.POST_PARENT_ID=0 '
            + (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');

        if (!Exporter.connection) {
            err = {error: 'MySQL connection is not setup. Run setup(config) first'};
            Exporter.error(err.error);
            return callback(err);
        }

        Exporter.connection.query(query,
            function(err, rows) {
                if (err) {
                    Exporter.error(err);
                    return callback(err);
                }

                //normalize here
                var map = {};

                rows.forEach(function(row) {
                    row._title = row._title ? row._title[0].toUpperCase() + row._title.substr(1) : 'Untitled';
                    row._timestamp = ((row._timestamp || 0) * 1000) || startms;
    
                    map[row._tid] = row;
                });

                callback(null, map);
            });
    };

    Exporter.getPosts = function(callback) {
        return Exporter.getPaginatedPosts(0, -1, callback);
    };
    Exporter.getPaginatedPosts = function(start, limit, callback) {
        callback = !_.isFunction(callback) ? noop : callback;

        var err;
        var prefix = Exporter.config('prefix');
        var startms = +new Date();
        var query =
            'SELECT ' + prefix + 'kunena_messages.id as _pid, '
            + prefix + 'kunena_messages.parent as _post_replying_to, '
            + prefix + 'kunena_messages.thread as _tid, '
            + prefix + 'kunena_messages.time as _timestamp, '
            // not being used
            + prefix + 'kunena_messages.time as _subject, '

            + prefix + 'kunena_messages_text.message as _content, '
            + prefix + 'kunena_messages.userid as _uid '

            // I couldn't tell what's the different, they're all HTML to me
            //+ 'POST_MARKUP_TYPE as _markup, '

            // maybe use this one to skip
            //+ 'POST_IS_APPROVED as _approved '

            + 'FROM ' + prefix + 'kunena_messages, ' + prefix + 'kunena_messages_text '
            + 'WHERE ' + prefix + 'kunena_messages.id=' + prefix + 'kunena_messages_text.mesid '
            // this post cannot be a its topic's main post, it MUST be a reply-post
            // see https://github.com/akhoury/nodebb-plugin-import#important-note-on-topics-and-posts
            + 'AND ' + prefix + 'kunena_messages.parent > 0 '
            + (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');


        if (!Exporter.connection) {
            err = {error: 'MySQL connection is not setup. Run setup(config) first'};
            Exporter.error(err.error);
            return callback(err);
        }

        Exporter.connection.query(query,
            function(err, rows) {
                if (err) {
                    Exporter.error(err);
                    return callback(err);
                }

                //normalize here
                var map = {};
                rows.forEach(function(row) {
                    row._content = row._content || '';
                    row._timestamp = ((row._timestamp || 0) * 1000) || startms;
                    map[row._pid] = row;
                });

                callback(null, map);
            });
    };

    Exporter.teardown = function(callback) {
        Exporter.log('teardown');
        Exporter.connection.end();

        Exporter.log('Done');
        callback();
    };

    Exporter.testrun = function(config, callback) {
        async.series([
            function(next) {
                Exporter.setup(config, next);
            },
            function(next) {
                Exporter.getUsers(next);
            },
            function(next) {
                Exporter.getCategories(next);
            },
            function(next) {
                Exporter.getTopics(next);
            },
            function(next) {
                Exporter.getPosts(next);
            },
            function(next) {
                Exporter.teardown(next);
            }
        ], callback);
    };
    
    Exporter.paginatedTestrun = function(config, callback) {
        async.series([
            function(next) {
                Exporter.setup(config, next);
            },
            function(next) {
                Exporter.getPaginatedUsers(0, 1000, next);
            },
            function(next) {
                Exporter.getPaginatedCategories(0, 1000, next);
            },
            function(next) {
                Exporter.getPaginatedTopics(0, 1000, next);
            },
            function(next) {
                Exporter.getPaginatedPosts(1001, 2000, next);
            },
            function(next) {
                Exporter.teardown(next);
            }
        ], callback);
    };

    Exporter.warn = function() {
        var args = _.toArray(arguments);
        args.unshift(logPrefix);
        console.warn.apply(console, args);
    };

    Exporter.log = function() {
        var args = _.toArray(arguments);
        args.unshift(logPrefix);
        console.log.apply(console, args);
    };
    
    Exporter.error = function() {
        var args = _.toArray(arguments);
        args.unshift(logPrefix);
        console.error.apply(console, args);
    };

    Exporter.config = function(config, val) {
        if (config != null) {
            if (typeof config === 'object') {
                Exporter._config = config;
            } else if (typeof config === 'string') {
                if (val != null) {
                    Exporter._config = Exporter._config || {};
                    Exporter._config[config] = val;
                }
                return Exporter._config[config];
            }
        }
        return Exporter._config;
    };

    // from Angular https://github.com/angular/angular.js/blob/master/src/ng/directive/input.js#L11
    Exporter.validateUrl = function(url) {
        var pattern = /^(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?$/;
        return url && url.length < 2083 && url.match(pattern) ? url : '';
    };

    Exporter.truncateStr = function(str, len) {
        if (typeof str != 'string') return str;
        len = _.isNumber(len) && len > 3 ? len : 20;
        return str.length <= len ? str : str.substr(0, len - 3) + '...';
    };

    Exporter.whichIsFalsy = function(arr) {
        for (var i = 0; i < arr.length; i++) {
            if (!arr[i])
                return i;
        }
        return null;
    };

})(module.exports);
