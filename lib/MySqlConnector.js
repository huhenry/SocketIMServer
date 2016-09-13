var mysql = require("mysql");
var conf =require("../conf/conf.js");

var mysqlPool = mysql.createPool(conf.mySQLDB.db1);

exports.MysqlPool = mysqlPool;
exports.Mysql = mysql;