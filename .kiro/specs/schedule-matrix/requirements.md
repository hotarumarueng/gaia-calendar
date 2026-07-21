# Requirements Document

## Project Description (Input)
複数人の定例会日程調整マトリクスアプリ。定例会に集まりたい社会人グループ（数人〜10人程度）が対象。固定枠の決め打ち運用では寝落ち・起きられないによる欠席が続いており、誰がいつなら来られるのかが可視化されていない。縦軸=参加者名、横軸=固定4時間帯（19-21/21-23/8-10/10-12）の常設マトリクス表で、各セルにその人の希望曜日を表示することで、実際に集まりやすい曜日×時間帯を見つけられるようにする。

## Introduction
本要件は、常設の日程調整マトリクス（feature: schedule-matrix）の利用者から見える振る舞いを定義する。
解決する問題は「誰がいつなら来られるのかが可視化されていないこと」であり、成功条件は「全員が自分のタイミングで希望を入力でき、表を見れば集まりやすい曜日×時間帯が一目で分かること」である。
技術構成は design フェーズで扱い、本書には含めない。

## Boundary Context
- **In scope**: 常設マトリクス表の閲覧、希望曜日の入力・上書き・削除、人単位の一言コメント、ログインなしの疑似本人確認（自分の入力だけを編集・削除できる見せ方）
- **Out of scope**: ログイン・認証、週次などの自動リセット、Slack 通知の自動化、時間帯（列）の追加・削除 UI、開催日時の自動レコメンド
- **Adjacent expectations**: 毎週の入力促しは Slack での手動運用が担う（本機能は促しを行わない）。なりすまし・悪意ある上書きの防止は提供せず、グループ内の信頼を前提とする

## Requirements

### Requirement 1: マトリクス表の閲覧
**Objective:** As a グループメンバー, I want 全員の希望を1枚の常設マトリクス表で見たい, so that 集まりやすい曜日×時間帯が一目で分かる

#### Acceptance Criteria
1. When 利用者がページを開いたとき, the schedule-matrix shall 縦軸=参加者名・横軸=固定4時間帯（19:00-21:00 / 21:00-23:00 / 8:00-10:00 / 10:00-12:00）のマトリクス表を表示する
2. The schedule-matrix shall 各セルに、その参加者がその時間帯で希望する曜日の一覧を表示する
3. When 参加者がある時間帯の希望を未入力のとき, the schedule-matrix shall 該当セルを空欄として表示する
4. The schedule-matrix shall 各参加者の行に、一言コメント（あれば）と最終編集日時（その参加者の希望・コメントのうち最新の更新日時）を表示する
5. If 参加者が1人も登録されていない, then the schedule-matrix shall 空である旨と入力方法の案内を表示する

### Requirement 2: 希望日時の入力・更新
**Objective:** As a 参加者, I want 自分のタイミングで時間帯ごとの希望曜日を入力・更新したい, so that 全員の予定を集める調整役なしで希望を伝えられる

#### Acceptance Criteria
1. When 参加者が名前と時間帯ごとの希望曜日を保存したとき, the schedule-matrix shall 名前の前後の空白を除去したうえで保存し、更新後の表を表示する
2. When 同じ名前・同じ時間帯の希望が再度保存されたとき, the schedule-matrix shall 既存の内容を上書きし、行を増やさない
3. When 保存後にページを再読み込みしたとき, the schedule-matrix shall 保存済みの内容を表示する（入力は永続化される）
4. When 参加者がある時間帯の希望曜日をすべて外して保存したとき, the schedule-matrix shall その参加者×時間帯の入力を削除し、セルを空欄に戻す
5. If 名前が空または空白のみで保存された, then the schedule-matrix shall 保存を行わず、名前が必要である旨を表示する

### Requirement 3: 疑似本人確認（ログインなし）
**Objective:** As a 参加者, I want ログインせずに自分の入力だけを編集・削除したい, so that 面倒な登録なしで安心して使える

#### Acceptance Criteria
1. When 参加者が名前を入力して保存したとき, the schedule-matrix shall その名前を利用者のブラウザに記憶する
2. While ブラウザに記憶された名前と一致する行が表示されているとき, the schedule-matrix shall その行にのみ編集・削除の操作を表示する
3. The schedule-matrix shall 記憶された名前と一致しない参加者の行には編集・削除の操作を表示しない

### Requirement 4: 一言コメント
**Objective:** As a 参加者, I want 自分の行に一言コメント（ステータス）を添えたい, so that 表だけでは伝わらない今週の状況を共有できる

#### Acceptance Criteria
1. When 参加者がコメントを入力して保存したとき, the schedule-matrix shall そのコメントをその参加者の情報として表に表示する
2. When 同じ参加者がコメントを再度保存したとき, the schedule-matrix shall 既存のコメントを上書きする
3. The schedule-matrix shall コメント未入力の参加者も（コメント欄が空のまま）表に表示する

### Requirement 5: 自分のデータの削除
**Objective:** As a 参加者, I want グループを抜けるときなどに自分のデータを消したい, so that 表に古い情報が残らない

#### Acceptance Criteria
1. When 参加者が自分の行の削除を実行したとき, the schedule-matrix shall その参加者の希望・コメントを含む全データを削除し、表から行を消す
2. When 削除の操作が行われたとき, the schedule-matrix shall 実行前に確認を求める

### Requirement 6: 利用環境・常設性
**Objective:** As a グループメンバー, I want 共有されたURLを開くだけでいつでも使えること, so that ITツールに不慣れでも参加できる

#### Acceptance Criteria
1. The schedule-matrix shall ログイン・会員登録なしで全機能を利用できる
2. When 利用者が共有URLをブラウザで開いたとき, the schedule-matrix shall 追加の設定なしで表の閲覧と入力を可能にする
3. The schedule-matrix shall スマートフォンおよびPCのブラウザで閲覧・入力できる
4. The schedule-matrix shall 参加者による明示的な削除以外でデータを消さない（自動リセットを行わない）
