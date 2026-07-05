const path = require('path');

const Sequelize = require('sequelize');
const sequelizeCursorPagination = require('sequelize-cursor-pagination');

/* Connect database */

const connect = async (database) => {
  /* Init database */

  const sequelize = new Sequelize('gb2260', undefined, undefined, {
    dialect: 'sqlite',
    storage: path.join(__dirname, `../../database/GB2260/${database}.sqlite`),
    // operatorsAliases: Sequelize.Op,
    logging: false,
    define: {
      timestamps: false,
      freezeTableName: true,
    },
  });

  /* Create tables */

  const code = { type: Sequelize.STRING, primaryKey: true };
  const name = Sequelize.STRING;
  const primaryKeyField = 'code';

  const Province = sequelize.define('province', { code, name });
  const City = sequelize.define('city', { code, name });
  const Area = sequelize.define('area', { code, name });

  /* With pagination */

  sequelizeCursorPagination({ primaryKeyField })(Province);
  sequelizeCursorPagination({ primaryKeyField })(City);
  sequelizeCursorPagination({ primaryKeyField })(Area);

  /* Set foreign key */

  Province.hasMany(City);

  City.belongsTo(Province);
  City.hasMany(Area);

  Area.belongsTo(Province);
  Area.belongsTo(City);

  // sync database
  try {
    await sequelize.sync();
  } catch (err) {
    console.log(err);
    process.exit(-1);
  }

  return { Database: sequelize, Province, City, Area };
};

module.exports = connect;
