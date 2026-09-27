# Pencil Dashboard

鉛筆で紙に描いたような見た目の、Obsidian用ホームダッシュボードプラグインです。

保管庫（Vault）の実データを表示します。カレンダーはコアプラグイン「デイリーノート」の設定、お気に入りはコアプラグイン「お気に入り（Starred）」、Todo は保管庫内の全ノートにあるチェックボックス（`- [ ]`）から集めます。

## 使い方

左のリボンにある鉛筆アイコン、またはコマンドパレットの「Open dashboard」でダッシュボードのタブを開きます。

- **Calendar**: 日付をクリックするとその日のデイリーノートを開きます（今日以降でまだ無ければ新規作成）。今日は赤い丸で囲みます。保存先フォルダー・日付の書式・テンプレートは、コアプラグイン「デイリーノート」の設定に従います（`YYYY/MM/YYYY-MM-DD` のような階層も可）。
- **Activity**: 直近20週間、1日ごとに更新したノートの数を斜線の濃さ5段階で表示します。
- **Favorite**: コアプラグイン「お気に入り」に登録したノート・フォルダが並びます。
- **Todo**: 保管庫内の `- [ ]` / `- [x]` をすべて集めます。行内に `#high` / `#medium` と書くと優先度タグに、`📅 2026-09-28` のように書くと期日になります（どちらもTodoの表示テキストからは取り除かれます）。チェックをクリックすると元のノートのその行を書き換えます。

- **背景**: 設定 → Pencil Dashboard で「紙」「コルクボード」を選べます。コマンドパレットの「背景を切り替え」でも切り替わります。

## インストール（BRAT）

BRAT の「Add Beta plugin」に `YOSHI933549/Obsidian-Dashboard` を入れると、最新のリリースが入ります。以降の更新も BRAT が取り込みます。

## リリースの作り方

`manifest.json` / `package.json` / `versions.json` のバージョンを上げてコミットし、同じ番号のタグ（例: `1.1.0`、`v` なし）を push すると、GitHub Actions がビルドして `main.js` / `manifest.json` / `styles.css` 付きのリリースを作ります。

## インストール（手動）

1. このリポジトリの `manifest.json` / `main.js` / `styles.css` を、保管庫の `<Vault>/.obsidian/plugins/pencil-dashboard/` にコピーします（フォルダが無ければ作成）。
2. Obsidian を再起動するか、コマンドパレットで「Reload app without saving」を実行します。
3. 設定 → コミュニティプラグイン から Pencil Dashboard を有効化します。

## 開発

```bash
npm install
npm run dev    # ソース変更を監視して main.js を再ビルド
npm run build  # 型チェック + 本番ビルド
```

`src/data.ts` が保管庫からのデータ取得、`src/view.ts` が描画、`src/main.ts` がプラグイン本体（コマンド・リボン登録、SVGフィルタの注入）です。

## index.html について

`index.html` は最初に作った単体デザイン試作（ブラウザで直接開けるHTML版）です。実際に使うのは上記のプラグインのほうです。
