# Node.js Project Kit - 便捷的Node.js项目初始化工具

[![Build Status](https://travis-ci.org/tonyc726/node-project-kit.svg?style=flat-square&branch=master)](https://travis-ci.org/tonyc726/node-project-kit)
[![bitHound Code](https://www.bithound.io/github/tonyc726/node-project-kit/badges/code.svg)](https://www.bithound.io/github/tonyc726/node-project-kit)
[![tested with jest](https://img.shields.io/badge/tested_with-jest-99424f.svg)](https://github.com/facebook/jest)
[![license](https://img.shields.io/github/license/mashape/apistatus.svg?style=flat-square)](https://github.com/tonyc726/node-project-kit)

> 背景：很多时候，需要快速开发一个新的web项目(Node.js居多)，但是在初始化项目的时候，需要配置各种工具(大部分是copy老项目的配置项)，这种体力活做多了就觉得麻烦，而且容易出错，自然而然想到了脚本处理，所以就有了这个项目。

需求清单:
- [x] 检查运行环境，Node.js需要`v6.*`及以上版本；
- [x] 自动部署[配置文件清单](#配置文件清单)的各项内容(基础版)；
- [x] 交互填写项目的基本信息；
- [x] 清理`git`记录，从新初始化log;

待开发的需求清单：
- [-] 增加交互环节的模板选择环节，对应生成`fis3`、`webpack`等等选择；

## 如何使用
> 使用前确保已经安装`v6.*`或者更新版本的Node.js，最好已经安装yarn以便于加快安装速度(`v5.*`版本的npm也是不错的选择)

1. `git clone https://github.com/tonyc726/node-project-kit`到本地；
2. `npm run setup`或者`yarn run setup`进入交互式安装过程，填写对应信息，即可完成初始化工作；
3. 微调配置，熟悉一下`package.json`中的各项内容，进入开发；

[![asciicast](https://asciinema.org/a/TThXDaifGa8TANRYRR7s46cBL.png)](https://asciinema.org/a/TThXDaifGa8TANRYRR7s46cBL)

## 工程说明

### 依赖模块
1. JS语法转换工具 - `Babel`(了解更多，可以参考一下[《Babel笔记》](https://itony.net/babel-note/)):
    * "babel-cli" -> Babel的命令行交互工具
    * "babel-preset-env" -> 根据目标环境的配置，自动调整语法转换时所需的Babel插件
    * "babel-runtime" & "babel-plugin-transform-runtime" -> 两者配合用以解决新语法中全局对象或者全局对象方法不足的问题
2. 测试工具:
    * "Jest" -> Facebook推出的一个极容易上手的JavaScript测试工具
3. 代码检测工具:
    * "eslint" -> 插件化的javascript代码检测工具
4. 其它小工具:
    * "rimraf" -> deep deletion module platform-independent
    * "cross-env" -> set node environment variables platform-independent
    * "npm-run-all" -> Command Line Interface to run multiple npm-scripts in parallel or sequential
    * "semantic-release" -> fully automated package publishing

### 配置文件清单

1. .babelrc -> Babel的配置项文件
2. .editorconfig -> 编码风格配置项（默认使用2个空格缩进）
3. .eslintrc -> ESLint的配置项（默认使用[airbnb](https://github.com/sivan/javascript-style-guide/blob/master/es5/README.md)的规则，稍加扩展）
4. .eslintignore -> ESLint的忽略清单
5. .travis.yml -> Travis CI的配置文件
6. .gitattributes -> Git属性配置文件（很少用）
7. .gitignore -> Git的忽略清单
8. webpack.config.babel.js -> ES6语法的webpack配置文件，需要配合Babel一起使用

## 目录结构
```
├── .babelrc
├── .editorconfig
├── .eslintignore
├── .eslintrc
├── .gitattributes
├── .gitignore
├── .travis.yml
├── LICENSE
├── README.md
├── dist
│   └── index.js
├── package.json
├── src
│   ├── index.js
│   └── index.test.js
└── yarn.lock
```

## License

Copyright © 2017-present. This source code is licensed under the MIT license found in the
[LICENSE](./LICENSE) file.

---
Made by Tony ([blog](https://itony.net))
