/* eslint-disable no-console, no-await-in-loop */
/**
 * 从 pageCacheDB 导出 stats.gov.cn 数据 - 优化版
 * 只导出指定年份，逐步处理避免内存问题
 */
const fs = require('fs');
const path = require('path');
const levelup = require('levelup');
const leveldown = require('leveldown');
const md5 = require('md5');
const iconv = require('iconv-lite');

const CACHE_DIR = path.join(__dirname, '../pageCacheDB/stats.gov.cn');
const OUTPUT_DIR = path.join(__dirname, '../data/stats.gov.cn');

const TARGET_YEAR = process.argv[2] || '2021'; // 默认导出 2021

// 递归获取下级数据
function getData(db, url) {
  return new Promise((resolve) => {
    const key = md5(url);
    db.get(key, (getErr, data) => {
      if (getErr || !data) {
        resolve(null);
      } else {
        // 数据存储时使用了错误的编码（GBK 字节被当作 UTF-8 字符串存储）
        // 需要先将其转换为 Buffer，再用 iconv 从 GBK 解码为 UTF-8
        let jsonStr;
        if (Buffer.isBuffer(data)) {
          // 直接作为 Buffer 处理（但已经是乱码字符串形式）
          // 需要将字符串当作 Latin1 解码回字节，再从 GBK 转 UTF-8
          const latin1Str = data.toString('latin1');
          jsonStr = iconv.decode(Buffer.from(latin1Str, 'latin1'), 'gbk');
        } else {
          // 如果是字符串
          const latin1Str = data.toString('latin1');
          jsonStr = iconv.decode(Buffer.from(latin1Str, 'latin1'), 'gbk');
        }

        try {
          resolve(JSON.parse(jsonStr));
        } catch (parseErr) {
          console.error('JSON 解析错误:', parseErr.message);
          resolve(null);
        }
      }
    });
  });
}

// 构建居委会数据 (最底层)
async function buildVillages(db, townList) {
  const result = [];

  for (let i = 0; i < townList.length; i += 1) {
    const t = townList[i];
    const item = { name: t.name, code: t.code };

    if (t.link) {
      const villages = await getData(db, t.link);
      if (villages) {
        item.villages = villages;
      }
    }

    result.push(item);
  }

  return result;
}

// 构建街道数据
async function buildTowns(db, countyList) {
  const result = [];

  for (let i = 0; i < countyList.length; i += 1) {
    const c = countyList[i];
    const item = { name: c.name, code: c.code };

    if (c.link) {
      const towns = await getData(db, c.link);
      if (towns && towns.length > 0) {
        item.towns = await buildVillages(db, towns);
      }
    }

    result.push(item);
  }

  return result;
}

// 构建区县数据
async function buildCounties(db, cityList) {
  const result = [];

  for (let i = 0; i < cityList.length; i += 1) {
    const c = cityList[i];
    const item = { name: c.name, code: c.code };

    if (c.link) {
      const counties = await getData(db, c.link);
      if (counties && counties.length > 0) {
        item.counties = await buildTowns(db, counties);
      }
    }

    result.push(item);
  }

  return result;
}

// 构建城市数据
async function buildCities(db, provinceList) {
  const result = [];

  for (let i = 0; i < provinceList.length; i += 1) {
    const p = provinceList[i];
    const item = { name: p.name, code: p.code };

    if (p.link) {
      const cities = await getData(db, p.link);
      if (cities && cities.length > 0) {
        item.cities = await buildCounties(db, cities);
      }
    }

    result.push(item);
  }

  return result;
}

levelup(leveldown(CACHE_DIR), (openErr, db) => {
  if (openErr) {
    console.error('❌ 无法打开数据库:', openErr.message);
    process.exit(1);
  }

  console.log('🚀 开始导出 stats.gov.cn 数据...\n');

  db.get('runHistory', (historyErr, historyData) => {
    if (historyErr) {
      console.error('❌ 无法读取运行历史:', historyErr.message);
      db.close();
      process.exit(1);
    }

    const runHistory = JSON.parse(historyData);
    const yearQueueMap = new Map();

    for (let i = 0; i < runHistory.length; i += 1) {
      const record = runHistory[i];
      if (record.queues) {
        for (let j = 0; j < record.queues.length; j += 1) {
          const queue = record.queues[j];
          if (queue.year && queue.url && !yearQueueMap.has(queue.year)) {
            yearQueueMap.set(queue.year, queue.url);
          }
        }
      }
    }

    const years = [...yearQueueMap.keys()].sort();
    console.log('📅 可用年份:', years.join(', '));

    if (!yearQueueMap.has(TARGET_YEAR)) {
      console.error('❌ 年份', TARGET_YEAR, '不存在');
      db.close();
      process.exit(1);
    }

    console.log('\n📝 导出年份:', TARGET_YEAR, '\n');

    // 直接查找目标年份的数据
    const entryUrl = yearQueueMap.get(TARGET_YEAR);
    const entryKey = md5(entryUrl);

    db.get(entryKey, (provinceErr, provincesData) => {
      if (provinceErr || !provincesData) {
        console.error('❌ 无法获取省份数据');
        db.close();
        process.exit(1);
      }

      const provinces = JSON.parse(provincesData);
      console.log('✅ 找到', provinces.length, '个省份\n');

      buildCities(db, provinces)
        .then((finalData) => {
          // 统计
          const provinceCount = finalData.length;
          let cityCount = 0;
          let countyCount = 0;
          let townCount = 0;
          let villageCount = 0;

          for (let i = 0; i < finalData.length; i += 1) {
            const province = finalData[i];
            if (province.cities) {
              cityCount += province.cities.length;
              for (let j = 0; j < province.cities.length; j += 1) {
                const city = province.cities[j];
                if (city.counties) {
                  countyCount += city.counties.length;
                  for (let k = 0; k < city.counties.length; k += 1) {
                    const county = city.counties[k];
                    if (county.towns) {
                      townCount += county.towns.length;
                      for (let l = 0; l < county.towns.length; l += 1) {
                        const town = county.towns[l];
                        if (town.villages) {
                          villageCount += town.villages.length;
                        }
                      }
                    }
                  }
                }
              }
            }
          }

          // 确保输出目录存在
          if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
          }

          const filename = `${TARGET_YEAR}.json`;
          fs.writeFileSync(
            path.join(OUTPUT_DIR, filename),
            JSON.stringify(finalData, null, 2)
          );

          console.log(`\n${'='.repeat(50)}`);
          console.log('✨ 导出完成！');
          console.log('📁 输出文件:', path.join(OUTPUT_DIR, filename));
          console.log('\n📊 统计:');
          console.log('   - 省份:', provinceCount);
          console.log('   - 城市:', cityCount);
          console.log('   - 区县:', countyCount);
          console.log('   - 街道:', townCount);
          console.log('   - 居委会:', villageCount);

          db.close();
        })
        .catch((buildErr) => {
          console.error('❌ 构建数据失败:', buildErr.message);
          db.close();
          process.exit(1);
        });
    });
  });
});
