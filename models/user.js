'use strict';
const laoder = require("./sequelize-loader");
const Sequelize = laoder.Sequelize;

const User = laoder = laoder.database.define('users', {
  userId: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    allowNull: false
  },
  username: {
    type: Sequelize.STRING,
    allowNull: false
  }
}, {
    freezeTableName: true,
    timestamps: false
  });

module.exports = User;