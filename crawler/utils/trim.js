/**
 * @author tongc726 <zhujf620@gmail.com>
 */

// 所有可能的空白字符
const whitespace = ' \n\r\t\f\x0b\xa0\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u200b\u2028\u2029\u3000';

/**
 * 去除字符串中的空白字符
 * @see http://www.cnblogs.com/rubylouvre/archive/2009/09/18/1568794.html
 *
 * @param {String} str - 待处理的字符串
 * @param {Boolean} strict - 是否去除所有空白
 * @return {String}
 */
module.exports = (str = '', strict = false) => {
  if (!str || str.length === 0) {
    return str;
  }
  let result = str;
  for (let i = 0, len = result.length; i < len; i += 1) {
    if (whitespace.indexOf(result.charAt(i)) === -1) {
      result = result.substring(i);
      break;
    }
  }

  for (let j = result.length - 1; j >= 0; j -= 1) {
    if (whitespace.indexOf(result.charAt(j)) === -1) {
      result = result.substring(0, j + 1);
      break;
    }
  }

  if (strict) {
    let strictResult = '';
    for (let i = 0, len = result.length; i < len; i += 1) {
      if (whitespace.indexOf(result.charAt(i)) === -1) {
        strictResult += result.charAt(i);
      }
    }
    result = strictResult;
  }

  return result;
};
