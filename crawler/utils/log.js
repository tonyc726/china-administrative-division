/**
 * @author tongc726 <zhujf620@gmail.com>
 */
const fs = require('fs');

/**
 * @class 生成日志
 */
class MakeLog {
  /**
   * @param {String} path - 日志文件绝对路径
   * @param {String} log - 初始化的日志文本
   */
  constructor(path, log) {
    this.path = path;
    this.stream = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';

    if (log && log.length) {
      this.add(log);
    }
  }

  /**
   * 新增日志
   * @param {String} [log = ''] - 新增的日志文本
   */
  add(log = '') {
    if (log.length) {
      this.stream += `
${log}

      `;
      fs.writeFileSync(
        this.path,
        this.stream,
        'utf8',
      );
    }
  }
}

/**
 * 增加日志
 *
 *
 *
 */
module.exports = (path = '', log = '') => (
  new MakeLog(path, log)
);
