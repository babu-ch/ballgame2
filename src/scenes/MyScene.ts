import Phaser from "phaser";
import {random, last} from "lodash";
import Image = Phaser.Physics.Matter.Image;
import Text = Phaser.GameObjects.Text;
import {isPc} from "../util.ts";
import Vector2 = Phaser.Math.Vector2;
import CollisionStartEvent = Phaser.Physics.Matter.Events.CollisionStartEvent;


// ゲームオーバーにする高さ
const GAMEOVER_LINE_Y = 150;

type BallType = {
    score: number;
    size: number;
    color: number;
    key: string;
}

export default class MyScene extends Phaser.Scene {
    // 全部のボールいれとく
    private balls: Image[];
    // 落とす前のボール
    private ball?: Image;
    // 最後に落としたボール
    private lastBall?: Image;
    // すこあ
    private score: number;
    // スコア表示
    private scoreText?: Text;
    // 次のボール撃てるか
    private nextBallReady: boolean;
    private gameOver: boolean;
    private ballTypes: BallType[]

    constructor() {
        super({key: "myscene"});
        this.balls = []
        this.score = 0;
        this.nextBallReady = true;
        this.gameOver = false;
        // ボールの種類 score=消した時の点数 size=大きさ  color=色
        this.ballTypes = [
            {score: 10, size: 50, color: 0xff5733, key: "0"},
            {score: 20, size: 75, color: 0x00bfa5, key: "1"},
            {score: 30, size: 90, color: 0x6f42c1, key: "2"},
            {score: 30, size: 110, color: 0x6f42c1, key: "3"},
            {score: 50, size: 140, color: 0x2ecc71, key: "4"},
            {score: 70, size: 170, color: 0xffc107, key: "5"},
            {score: 140, size: 200, color: 0x3498db, key: "6"},
            {score: 300, size: 240, color: 0xd32f2f, key: "7"},
        ];
    }

    preload() {
        ["0", "1", "2", "3", "4", "5", "6", "7"].forEach((key) => {
            this.load.image(key, `./${key}.png`);
        });
    }

    create() {
        this.matter.world.setBounds(0, 0, this.sys.canvas.width, this.sys.canvas.height);

        // init
        this.score = 0
        this.gameOver = false
        this.nextBallReady = true
        this.balls = []
        this.scoreText = this.add.text(0, 0, `score: ${this.score}`)

        // ゲームオーバーの線
        this.add.line(0, GAMEOVER_LINE_Y, 1600, 0, 0, 0, 0xff)

        // クリックした時
        if (isPc) {
            this.input.on("pointerdown", () => {
                this.onClick()
            });
        } else {
            this.input.on("pointerup", () => {
                this.onClick()
            })
        }

        // 最初のボールを作成
        this.ball = this.getBall(400, 100, this.ballTypes[0], false)

        // 衝突判定をセット
        this.setCollision()
    }

    getBall(x: number, y: number, type: BallType, isRandomRotation=false) {
        const ball = this.matter.add.image(
            x, y, type.key, undefined, {shape: {type: 'circle',}, ignorePointer: true})
        ball.setDisplaySize(type.size, type.size)
        ball.setCircle(type.size / 2)
        ball.setBounce(0.2);
        if (isRandomRotation) {
            ball.setRotation(random(360));
        }
        // 作成時は静的に
        ball.setSensor(true)
        ball.setStatic(true)
        // なぜか実際の判定より大きく書かれるのでだめだった
        // ball.preFX?.addCircle(1, type.color, 0, 1, 0)
        return ball
    }

    update() {
        // 発射前のボールはマウスに追従させる
        if (this.ball!.isStatic()) {
            if (isPc) {
                this.ball!.x = this.input.mousePointer.x;
            } else {
                this.ball!.x = this.input.activePointer.x;
            }
        }
    }

    setCollision() {

        this.matter.world.on("collisionstart", (e:CollisionStartEvent) => {
            if (this.gameOver) {
                return
            }
            e.pairs.forEach(pair => {
                const o1 = pair.bodyA
                const o2 = pair.bodyB
                const ball1 = o1.gameObject
                const ball2 = o2.gameObject
                if ((this.ball !== ball1 && this.ball !== ball2) && ball1 === this.lastBall || ball2 === this.lastBall) {
                    this.nextBallReady = true
                }
                if (o1.label !== "Circle Body" || o2.label !== "Circle Body") {
                    return;
                }
                if (!ball1 || !ball2) {
                    return;
                }
                const width1 = Math.round(ball1.displayWidth);
                const width2 = Math.round(ball2.displayWidth)
                if (ball1.isStatic() || ball2.isStatic()) {
                    return
                }
                // 大きさが同じボールのみ消す
                if (width1 !== width2) {
                    // ゲームオーバー判定  最後のボールがラインを超えたか？
                    if ((ball1 === this.lastBall || ball2 === this.lastBall) && this.lastBall!.y < GAMEOVER_LINE_Y) {
                        this.gameOver = true
                        this.drawGameOverTexts()
                    }
                    return;
                }
                this.nextBallReady = true
                // スコア加算
                const currentType = this.ballTypes.find(type => type.size === width1)
                if (currentType) {
                    this.score += currentType.score
                    this.scoreText!.setText(`score: ${this.score}`)
                }
                ball1.destroy()
                ball2.destroy()

                // ボールが消えたときに空中に残ることがあるので、生きているボールに下方向の力を加える
                setTimeout(() => {
                    this.balls.filter(b => b.active).forEach(b => {
                        if (b === this.lastBall) {
                            return
                        }
                        b.applyForce(new Vector2(0, 0.01))
                    })
                }, 20)

                // 一番でけぇボールなら消すだけ
                if (width1 === last(this.ballTypes)!.size) {
                    return
                }
                // そうじゃないなら2つのボールの中心点に次の大きさのボール作る
                const pos = getMiddlePoint(o1, o2)
                this.makeNewBall(pos.x, pos.y, width1)
            })

        });
    }

    // クリックしたとき
    onClick() {
        if (!this.nextBallReady || this.gameOver) {
            return
        }
        this.nextBallReady = false
        // 物理エンジンを適用して落下さす
        const ball = this.ball!
        this.applyPhysicsToBall(ball)
        this.lastBall = ball

        // 次のボール作る
        const ballType = this.ballTypes[random(0, 3)]
        this.ball = this.getBall(400, 100, ballType)
    }

    // 次の大きさのボールつくる
    makeNewBall(x: number, y: number, size: number) {
        const nextType = this.ballTypes[this.ballTypes.findIndex(type => type.size === size) + 1]
        const ball = this.getBall(x, y, nextType, true)
        this.applyPhysicsToBall(ball, true)
    }

    // ボールに物理エンジンを適用
    applyPhysicsToBall(ball: Image, isNew = false) {
        ball.setSensor(false)
        ball.setStatic(false)
        ball.setBounce(0.5)
        ball.applyForce(new Vector2(0, isNew ? -0.1 : 0.01))
        this.balls.push(ball)
    }

    // SPとPCで描画場所変える
    // 本当はPCでも割合計算すればマジックナンバー不要かも
    // y座標は対応さぼった
    drawGameOverTexts() {
        const x = isPc ? 400 : (window.innerWidth / 2)
        const scoreText = isPc ? `GAMEOVER score: ${this.score}` : `GAMEOVER\nscore: ${this.score}`
        this.add.text(x, 300, scoreText, {fontSize: 20, color: "black", backgroundColor:"#FFF"}).setOrigin(0.5)

        const buttonX = isPc ? 400 : (window.innerWidth / 2)
        const button = this.add.text(buttonX, 400, "RETRY", {fontSize: "32px", color:"black", backgroundColor:"#FFF"})
        button.setOrigin(0.5)
        button.on("pointerdown", () => {
            this.scene.restart()
        })
        button.setInteractive()
    }
}


// 真ん中ミツケル
function getMiddlePoint(ball1: any, ball2: any) {
    const middleX = (ball1.position.x + ball2.position.x) / 2
    const middleY = (ball1.position.y + ball2.position.y) / 2
    return {x: middleX, y: middleY}
}