var mysqlConnector = require("./MySqlConnector.js");
var pool = mysqlConnector.MysqlPool;
var mysql = mysqlConnector.Mysql;

var Message = function(){

}
Message.prototype.SaveMessage = function (from, to, message, sendDate, receiveDate, callback) {
    var self = this;
    pool.getConnection(function (err, connection) {
        if (err) {
            if (connection) {
                connection.release();
            }
            return callback(true, null);
        } else {
            var sqlQuery = "INSERT into ?? (??,??,??,??,??) VALUES (?,?,?,?,?)";
            var inserts = ["messages", "from", "to", "message", "sendDate", "receiveDate", from, to, message, sendDate, receiveDate];
            sqlQuery = mysql.format(sqlQuery, inserts);
            connection.query(sqlQuery, function (err, rows) {
                connection.release();
                if (err) {
                    return callback(true, null);
                } else {
                    callback(false, "comment added");
                }
            });
        }
        connection.on('error', function (err) {
            return callback(true, null);
        });
    });
}

Message.prototype.ReadMessage = function (receiveEmail, callback) {
    var self = this;
    pool.getConnection(function (err, connection) {
        if (err) {
            if (connection) {
                connection.release();
            }
            return callback(true, null);
        } else {
            var sqlQuery = "select ??,??,??,??,??,?? from ?? where ?? = ? and ?? is null";
            var inserts = ["messageId", "from", "to", "message", "sendDate", "receiveDate", "messages", "to", receiveEmail, "receiveDate"];
            sqlQuery = mysql.format(sqlQuery, inserts);
            connection.query(sqlQuery, function (err, rows) {
                connection.release();
                if (err) {
                    return callback(true, null);
                } else {
                    callback(false, rows);
                }
            });
        }
        connection.on('error', function (err) {
            return callback(true, null);
        });
    });
}

Message.prototype.ReceiveMessage = function (messageId, receiveDate, callback) {
    var self = this;
    pool.getConnection(function (err, connection) {
        if (err) {
            if (connection) {
                connection.release();
            }
            return callback(true, null);
        } else {
            var sqlQuery = "update ?? set ??=? where ?? = ? ";
            var inserts = ["Messages", "receiveDate", receiveDate, "messageId", messageId];
            sqlQuery = mysql.format(sqlQuery, inserts);
            connection.query(sqlQuery, function (err, rows) {
                connection.release();
                if (err) {
                    return callback(true, null);
                } else {
                    callback(false, null);
                }
            });
        }
        connection.on('error', function (err) {
            return callback(true, null);
        });
    });
}

exports.messager = new Message();
