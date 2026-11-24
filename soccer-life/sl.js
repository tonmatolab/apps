// Node（テスト）とオンラインのサーバーから使う入口。ルールのファイルをまとめて読み込んで SL を返す。
// ブラウザでは index.html が <script> で同じ順に読み込む（core.js → core-collection.js → core-games.js）。
'use strict';
const SL = require('./core.js');
require('./core-collection.js');
require('./core-games.js');
module.exports = SL;
