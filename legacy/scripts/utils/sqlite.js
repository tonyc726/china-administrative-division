const path = require('path');

const Sequelize = require('sequelize');
const sequelizeCursorPagination = require('sequelize-cursor-pagination');

/* Connect database */

const connect = async (database) => {
  /* Init database */

  const sequelize = new Sequelize(
    `stats.gov.cn-${database}`,
    undefined,
    undefined,
    {
      dialect: 'sqlite',
      storage: path.join(
        __dirname,
        `../../database/stats.gov.cn/${database}.sqlite`
      ),
      // operatorsAliases: Sequelize.Op,
      logging: false,
      define: {
        timestamps: false,
        freezeTableName: true,
      },
    }
  );

  /* Create tables */

  const code = { type: Sequelize.STRING, primaryKey: true };
  const name = Sequelize.STRING;
  const categoryCode = Sequelize.STRING;
  const primaryKeyField = 'code';

  const Province = sequelize.define('province', { code, name });
  const City = sequelize.define('city', { code, name });
  const Area = sequelize.define('area', { code, name });
  const Street = sequelize.define('street', { code, name });
  const Village = sequelize.define('village', { code, name, categoryCode });

  /* With pagination */

  sequelizeCursorPagination({ primaryKeyField })(Province);
  sequelizeCursorPagination({ primaryKeyField })(City);
  sequelizeCursorPagination({ primaryKeyField })(Area);
  sequelizeCursorPagination({ primaryKeyField })(Street);
  sequelizeCursorPagination({ primaryKeyField })(Village);

  /* Set foreign key */

  Province.hasMany(City);

  City.belongsTo(Province);
  City.hasMany(Area);

  Area.belongsTo(Province);
  Area.belongsTo(City);
  Area.hasMany(Street);

  Street.belongsTo(Province);
  Street.belongsTo(City);
  Street.belongsTo(Area);
  Street.hasMany(Village);

  Village.belongsTo(Province);
  Village.belongsTo(City);
  Village.belongsTo(Area);
  Village.belongsTo(Street);

  // sync database
  try {
    await sequelize.sync();
  } catch (err) {
    console.log(err);
    process.exit(-1);
  }

  return { Database: sequelize, Province, City, Area, Street, Village };
};

module.exports = connect;
