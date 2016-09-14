var express = require('express'),
    cluster = require('cluster'),
    net = require('net'),
    sio = require('socket.io'),
    sio_redis = require('socket.io-redis');
var message =require("../lib/Messager").messager;
/**
 * online users
 */
var connections = {};
var usersConnected =0;
var port = 3000,
    num_processes = require('os').cpus().length;

if (cluster.isMaster) {
    // This stores our workers. We need to keep them to be able to reference
    // them based on source IP address. It's also useful for auto-restart,
    // for example.
    var workers = [];

    // Helper function for spawning worker at index 'i'.
    var spawn = function(i) {
        workers[i] = cluster.fork();

        // Optional: Restart worker on exit
        workers[i].on('exit', function(code, signal) {
            console.log('respawning worker', i);
            spawn(i);
        });
    };

    // Spawn workers.
    for (var i = 0; i < num_processes; i++) {
        spawn(i);
    }

    // Helper function for getting a worker index based on IP address.
    // This is a hot path so it should be really fast. The way it works
    // is by converting the IP address to a number by removing non numeric
    // characters, then compressing it to the number of slots we have.
    //
    // Compared against "real" hashing (from the sticky-session code) and
    // "real" IP number conversion, this function is on par in terms of
    // worker index distribution only much faster.
    var worker_index = function(ip, len) {
        var s = '';
        for (var i = 0, _len = ip.length; i < _len; i++) {
            if (!isNaN(ip[i])) {
                s += ip[i];
            }
        }

        return Number(s) % len;
    };

    // Create the outside facing server listening on our port.
    var server = net.createServer({ pauseOnConnect: true }, function(connection) {
        // We received a connection and need to pass it to the appropriate
        // worker. Get the worker for this connection's source IP and pass
        // it the connection.
        var worker = workers[worker_index(connection.remoteAddress, num_processes)];
        worker.send('sticky-session:connection', connection);
    }).listen(port);
} else {
    // Note we don't use a port here because the master listens on it for us.
    var app = new express();

    // Here you might use middleware, attach routes, etc.
    // Don't expose our internal server to the outside.
    var server = app.listen(0, 'localhost'),
        io = sio(server,{'pingInterval': 10000, 'pingTimeout': 25000});

    // Tell Socket.IO to use the redis adapter. By default, the redis
    // server is assumed to be on localhost:6379. You don't have to
    // specify them explicitly unless you want to change them.
    io.adapter(sio_redis({ host: 'localhost', port: 6379 }));

    // Here you might use Socket.IO middleware for authorization etc.

    // Listen to messages sent from the master. Ignore everything else.
    process.on('message', function(message, connection) {
        if (message !== 'sticky-session:connection') {
            return;
        }

        // Emulate a connection event on the server by emitting the
        // event with the connection the master sent us.
        server.emit('connection', connection);

        connection.resume();
    });





    io.on('connection', function (socket) {
        socket.auth = false;
        console.log("new client joined! %s", socket.id);
        usersConnected++;

        console.log("There are %s users online!", usersConnected.toString());
        socket.setMaxListeners(0);
        socket.on('authenticate', function (data) {
            console.log(data);
            if(data && typeof data ==="string"){
                data = JSON.parse(data);
            }
            console.log('socket client ask for auth %s : %s : %s', data.token, data.email, socket.id);
            socket.email = data.email.toLowerCase();

            //check the auth data sent by the client
            checkAuthToken(data, function (err, success) {
                if (!err && success) {
                    console.log("Authenticated socket %s %s", socket.id, socket.email);
                    socket.auth = true;


                    //log.info("Authenticated socket %s  %s ", socket.id, socket.email)

                    // store the connected socket client on online list
                    connections[data.email.toLowerCase()] = socket;

                    socket.emit('authenticated', success);

                    var onlineusers = Object.keys(connections);
                    console.log("online Users &ss",onlineusers);
                    io.emit('onlineUsers',onlineusers);


                    receiveMessage(data.email.toLowerCase(), function (err, messages) {
                        if (err) return;
                        var sendMessage = [];
                        if (messages.length > 0) {
                            socket.emit("receiveMessage", messages);
                        }
                        for (var i = 0; i < messages.length; i++) {

                            var now = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
                            message.ReceiveMessage(messages[i].messageId, now, function (err, data) {
                            });
                        }
                    });


                } else if (err) {

                    console.log('Authentication error socket %s: %s', socket.id, err.message);
                    //log.error(err, 'Authentication error socket %s: %s', socket.id, err.message);
                    socket.emit('unauthorized', {message: err.message}, function () {
                        socket.disconnect();
                    });
                } else {
                    //log.error(null, 'Authentication failure socket %s  %s', socket.id, socket.email);
                    console.log('Authentication failure socket %s', socket.id);
                    socket.emit('unauthorized', {message: 'Authentication failure'}, function () {
                        socket.disconnect();
                    });
                }
            });
        });

        setTimeout(function () {
            //If the socket didn't authenticate, disconnect it
            if (!socket.auth) {
                //log.info("clear unauthorized client socket %s",socket.id);
                console.log("Disconnecting socket ", socket.id);
                socket.disconnect('unauthorized');
            }
        }, 600000);


        socket.on('disconnect', function (clientInfo) {

            if(socket.email)
            {

                io.emit("offline",socket.email);

                console.log("user %s is offline!",socket.email);
            }
            else{

                console.log("user %s is offline!",socket.id);
            }

            console.log("There are %s users online!", usersConnected.toString());
            // remove online connectios when client socket disconnect
            if (connections[socket.email]) {

                usersConnected--;
                delete connections[socket.email];
            }

            var onlineusers = Object.keys(connections);
            console.log("online Users &ss",onlineusers);
            io.emit('onlineUsers',onlineusers);
        });


        socket.on('sendMessage', function (data) {
            if(data && typeof data ==="string"){
                data = JSON.parse(data);
            }
            //log.info("receive message from %s to %s with message : %s", data.from, data.to, data.message);
            console.log("receive message from %s to %s with message : %s", data.from, data.to, data.message);
            var receiveEmail = data.to.toLowerCase();
            target = connections[receiveEmail];
            if (target) {

                var now = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

                data.sendDate = now;
                var comments =[];
                comments.push(data);
                //log.info("send message %s to %s ", data.message, target.email)
                console.log("send message %s to %s",data.message, target.email);
                target.emit("receiveMessage", comments);
                message.SaveMessage(data.from.toLowerCase(), data.to.toLowerCase(), data.message, now, now, function (err, data) {

                });
            }
            else {
                //log.info("store offline message %s %s %s ",data.from.toLowerCase(), data.to.toLowerCase(), data.message);
                var now = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
                message.SaveMessage(data.from.toLowerCase(), data.to.toLowerCase(), data.message, now, null, function (err, data) {

                });

            }
        });


    });

    var receiveMessage = function (email, callback) {
        message.ReadMessage(email, function (err, messages) {
            if (err) {
                callback(true, null);
            }
            else {
                callback(false, messages);
            }

        })
    };

    var checkAuthToken = function (data, cb) {
        if (!data.token) {
            //log.error(new Error('Missing credentials'),"checkAuthToken failed")
            cb(new Error('Missing credentials'));
        }

        //log.info("validate token %s", data.token);
        cb(null, data.token === 'fixedtoken');
    };



}