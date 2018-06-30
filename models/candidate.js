'use strict';
const loader = require('./sequelize-loader');
const Sequelize = loader.Sequelize;

const Candidate = loader.database.define('canditates', {
  candidateId: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncreament: true,
    allowNull: false
  },
  candidateName: {
    type: Sequelize.STRING,
    allowNull: false
  },
  scheduleId: {
    type: Sequelize.UUID,
    allowNull: false
  }
}, {
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        fields: ['scheudleId']
      }
    ]
  });

module.exports = Candidate;