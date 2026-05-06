// =====================================================================
// Vibe Killer — v0.1
// A side-scrolling beat-em-up where you transform Bad Vibe Zombies into
// Good Vibes via the power of high-fives. Setting: bar "On the Rocks".
// All art is generated from primitives via Phaser.Graphics.generateTexture.
// =====================================================================

// =====================================================================
// Level data — everything is in SCREEN-RELATIVE units so layout adapts to
// any browser size. The bg image is stretched to fill the world.
//
// worldScreensWide:        world width = screenW × this. 1 = no scrolling.
// characterHeightFraction: character display height as a fraction of screenH.
// floorTop/BottomFraction: walkable band, fractions of screenH (FEET positions).
// playerStart.{x,y}Fraction: spawn, fractions of (worldW, screenH) — feet pos.
// =====================================================================
const LEVELS = [
  {
    id: '1-1',
    name: 'ON THE ROCKS — 1-1',
    bg: { key: 'bg_1_1', path: 'assets/bar-bg.png' },
    worldScreensWide: 1.8,
    characterHeightFraction: 0.45,
    floorTopFraction: 0.72,
    floorBottomFraction: 0.94,
    playerStart: { xFraction: 0.08, yFraction: 0.92 },
    waves: [
      { count: 2, delay: 900 },
      { count: 3, delay: 800 },
      { count: 4, delay: 700 }
    ]
  },
  {
    id: '1-2',
    name: 'BACK ROOM — 1-2',
    bg: { key: 'bg_1_2', path: 'assets/bar-bg2.png' },
    worldScreensWide: 1.8,
    characterHeightFraction: 0.45,
    floorTopFraction: 0.72,
    floorBottomFraction: 0.94,
    playerStart: { xFraction: 0.08, yFraction: 0.92 },
    waves: [
      { count: 3, delay: 800 },
      { count: 4, delay: 700 },
      { count: 5, delay: 650 }
    ]
  }
];

// Texture height of a character sprite, used to derive characterScale.
const CHARACTER_TEXTURE_H = 80;

const COLORS = {
  // Player (dark hair, black tee, jeans — matches concept art)
  pSkin:  0xe8b895,
  pHair:  0x2d1810,
  pShirt: 0x1f1f1f,
  pJeans: 0x2b4870,
  pBoots: 0x1a0e08,

  // Bad Vibe Zombie — sad, slumped, sickly green-grey
  zSkin:  0x7a8870,
  zHair:  0x404038,
  zShirt: 0x484848,
  zPants: 0x2a2a30,
  zEyes:  0xc8c060,

  // Good Vibe (post-transform) — bright, joyful
  gSkin:  0xf0c89a,
  gShirt: 0xff5577,
  gPants: 0x4080d0,
  gEyes:  0x40d8ff,

  text:   0xe8d4a0
};

class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  init(data) {
    const idx = (data && typeof data.level === 'number') ? data.level : 0;
    this.levelIndex = Phaser.Math.Clamp(idx, 0, LEVELS.length - 1);
    this.level = LEVELS[this.levelIndex];
    // Score carries across level transitions and restarts; reset only on first boot.
    this.carryScore = (data && typeof data.score === 'number') ? data.score : 0;
  }

  preload() {
    this.load.image(this.level.bg.key, this.level.bg.path);
  }

  create() {
    // ----- Derive everything from current screen size -----
    this.screenW = this.scale.width;
    this.screenH = this.scale.height;

    // World = playable arena. World height matches screen (no vertical scroll).
    // World width = N screens wide.
    this.worldW = this.screenW * this.level.worldScreensWide;
    this.worldH = this.screenH;

    // Character scale derived from texture height + target screen fraction
    this.characterScale = (this.screenH * this.level.characterHeightFraction) / CHARACTER_TEXTURE_H;
    this.spriteH = CHARACTER_TEXTURE_H * this.characterScale;

    // Floor band = where character feet (sprite y, since origin is 1.0) can stand
    this.floorTop    = this.screenH * this.level.floorTopFraction;
    this.floorBottom = this.screenH * this.level.floorBottomFraction;

    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);

    // Two layers — main camera renders worldLayer, UI camera renders uiLayer.
    // Anything spawned dynamically (bursts, floaters) must be added to worldLayer
    // via this.worldAdd() so it renders with the world camera.
    this.worldLayer = this.add.layer();
    this.uiLayer    = this.add.layer();
    this.worldAdd   = (obj) => { this.worldLayer.add(obj); return obj; };

    this.createTextures();
    this.buildBackground();

    // ----- Player -----
    const startX = this.worldW  * this.level.playerStart.xFraction;
    const startY = this.screenH * this.level.playerStart.yFraction;
    this.player = this.physics.add.sprite(startX, startY, 'player_idle');
    this.player.setOrigin(0.5, 1.0);          // y = feet position
    this.player.setScale(this.characterScale);
    // Body: feet area (last 30 of the 80px texture). Phaser scales body
    // dimensions with sprite.scale, so these are in TEXTURE units.
    this.player.body.setSize(36, 30).setOffset(6, 50);
    this.player.mood = 100;
    this.player.maxMood = 100;
    this.player.attacking = false;
    this.player.attackTimer = 0;
    this.player.cooldown = 0;
    this.player.invuln = 0;
    this.player.facing = 1;
    this.player.walkPhase = 0;
    this.worldAdd(this.player);

    // Attack hitbox — invisible rect, enabled only during the attack window.
    // Sized in world units (already scaled).
    const reachW = 60 * this.characterScale;
    const reachH = 38 * this.characterScale;
    this.attackBox = this.add.rectangle(0, 0, reachW, reachH, 0xffe066, 0);
    this.physics.add.existing(this.attackBox);
    this.attackBox.body.setAllowGravity(false);
    this.attackBox.body.enable = false;
    this.worldAdd(this.attackBox);

    // Tracks enemies hit by the *current* swing (so one swing = one hit per enemy)
    this.currentAttackHits = new Set();

    // "HIGH FIVE!" text that pops up when the player attacks
    this.attackText = this.add.text(0, 0, 'HIGH FIVE!', {
      fontFamily: 'Courier New, monospace',
      fontSize: `${Math.round(14 * this.characterScale * 0.5)}px`,
      color: '#ffe066',
      stroke: '#1a0a0a',
      strokeThickness: 4,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(900).setVisible(false);
    this.worldAdd(this.attackText);

    // ----- Enemies -----
    this.enemies = this.physics.add.group();
    this.activeEnemies = 0;
    this.enemiesToSpawn = 0;

    // ----- Game state -----
    this.score = this.carryScore;
    this.waveIndex = 0;
    this.waves = this.level.waves;
    this.gameState = 'playing'; // 'playing' | 'gameover' | 'cleared'

    // ----- Input -----
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keysWASD = this.input.keyboard.addKeys('W,A,S,D');
    this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyR     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    // ----- Collisions -----
    this.physics.add.overlap(this.player, this.enemies, this.handleContact, null, this);
    this.physics.add.overlap(this.attackBox, this.enemies, this.handleHit, null, this);

    // ----- Cameras -----
    // World cam: 1:1 with screen (no zoom — world is already in screen units).
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.worldW, this.worldH);
    cam.startFollow(this.player, true, 0.12, 0);
    cam.ignore(this.uiLayer);

    // UI cam: 1:1 with screen, no scroll.
    this.uiCam = this.cameras.add(0, 0, this.screenW, this.screenH);
    this.uiCam.ignore(this.worldLayer);

    this.createHUD();

    // Resize → restart scene with the new dimensions. Simplest reliable path
    // since worldW/H, character scale, floor band, and BG stretch all depend
    // on screen size; in-place re-layout would be a lot of bookkeeping.
    this.scale.on('resize', this.handleResize, this);

    // First wave starts shortly after scene load
    this.time.delayedCall(700, () => this.spawnNextWave());
  }

  handleResize() {
    if (this.scale.width === 0 || this.scale.height === 0) return;
    // Debounce window-drag spam: only restart 200ms after the last resize event.
    if (this._resizeTimer) this._resizeTimer.remove(false);
    this._resizeTimer = this.time.delayedCall(200, () => {
      this._resizeTimer = null;
      this.scene.restart({ level: this.levelIndex, score: this.score });
    });
  }

  // =====================================================================
  // Texture generation — all character art is drawn pixel-by-pixel into a
  // Graphics object, then baked to a texture for use as a sprite.
  // =====================================================================

  createTextures() {
    this.makePlayerTexture('player_idle',   0);
    this.makePlayerTexture('player_walk',   1);
    this.makePlayerTexture('player_attack', 2);
    this.makeEnemyTexture('zombie_walk1',   'sad',   0);
    this.makeEnemyTexture('zombie_walk2',   'sad',   1);
    this.makeEnemyTexture('zombie_happy',   'happy', 0);
    this.makeBurstTexture();
  }

  makePlayerTexture(key, frame) {
    // 48 wide, 80 tall. Origin (0,0) at top-left.
    // frame: 0=idle, 1=walk (slight bob), 2=attack (right arm extended)
    const g = this.add.graphics();
    const C = COLORS;
    const px = (x, y, c, w = 1, h = 1) => { g.fillStyle(c, 1); g.fillRect(x, y, w, h); };

    const legBob = frame === 1 ? 1 : 0;

    // Legs (jeans + boots)
    px(18, 60, C.pJeans, 5, 16 - legBob);
    px(25, 60, C.pJeans, 5, 16);
    px(18, 76 - legBob, C.pBoots, 5, 4);
    px(25, 76, C.pBoots, 5, 4);

    // Belt + torso (black tee)
    px(15, 38, C.pShirt, 18, 22);
    px(15, 58, 0x1a0a05, 18, 2);

    // Arms
    if (frame === 2) {
      // Attack pose — left arm tucked, right arm reaching out for the high-five
      px(13, 40, C.pShirt, 4, 14);
      px(13, 54, C.pSkin, 4, 4);
      px(33, 36, C.pShirt, 4, 6);
      px(37, 34, C.pSkin, 6, 8);
      px(43, 30, C.pSkin, 4, 12); // hand
      // Spark on the palm
      px(45, 28, 0xffe066, 2, 2);
    } else {
      const armBob = frame === 1 ? -1 : 0;
      px(11, 40 + armBob, C.pShirt, 4, 14);
      px(11, 54 + armBob, C.pSkin, 4, 4);
      px(33, 40 - armBob, C.pShirt, 4, 14);
      px(33, 54 - armBob, C.pSkin, 4, 4);
    }

    // Neck + head + hair
    px(21, 34, C.pSkin, 6, 4);
    px(17, 18, C.pSkin, 14, 16);
    px(15, 14, C.pHair, 18, 8);
    px(13, 18, C.pHair, 4, 6);
    px(31, 18, C.pHair, 4, 6);
    // Eyes + mouth
    px(20, 24, 0x1a0a05, 2, 2);
    px(26, 24, 0x1a0a05, 2, 2);
    px(22, 30, 0x6a3020, 4, 1);

    g.generateTexture(key, 48, 80);
    g.destroy();
  }

  makeEnemyTexture(key, mood, frame) {
    const g = this.add.graphics();
    const C = COLORS;
    const isHappy = mood === 'happy';
    const skin  = isHappy ? C.gSkin  : C.zSkin;
    const shirt = isHappy ? C.gShirt : C.zShirt;
    const pants = isHappy ? C.gPants : C.zPants;
    const eye   = isHappy ? C.gEyes  : C.zEyes;
    const hair  = isHappy ? 0x6a3020 : C.zHair;
    const px = (x, y, c, w = 1, h = 1) => { g.fillStyle(c, 1); g.fillRect(x, y, w, h); };

    const legBob = frame === 1 ? 1 : 0;
    const slump  = isHappy ? 0 : 2; // sad zombies slump forward

    // Legs
    px(18, 60, pants, 5, 16 - legBob);
    px(25, 60, pants, 5, 16);
    px(18, 76 - legBob, 0x1a0a05, 5, 4);
    px(25, 76, 0x1a0a05, 5, 4);

    // Torso
    px(15, 38 + slump, shirt, 18, 22 - slump);

    // Arms
    if (isHappy) {
      // Slightly raised, alive
      px(11, 38, shirt, 4, 12);
      px(11, 50, skin, 4, 4);
      px(33, 38, shirt, 4, 12);
      px(33, 50, skin, 4, 4);
    } else {
      // Drooped
      px(11, 42, shirt, 4, 14);
      px(11, 56, skin, 4, 4);
      px(33, 42, shirt, 4, 14);
      px(33, 56, skin, 4, 4);
    }

    // Neck + head
    px(21, 34 + slump, skin, 6, 4);
    px(17, 18 + slump, skin, 14, 16);
    // Messy hair
    px(15, 14 + slump, hair, 18, 8);
    px(13, 18 + slump, hair, 3, 8);
    px(32, 18 + slump, hair, 3, 8);

    if (isHappy) {
      // Closed-eye smile, blush, big grin
      px(19, 24, 0x1a0a05, 4, 1);
      px(25, 24, 0x1a0a05, 4, 1);
      px(18, 25, 0x1a0a05, 1, 1);
      px(28, 25, 0x1a0a05, 1, 1);
      px(17, 27, 0xff8090, 3, 2);
      px(28, 27, 0xff8090, 3, 2);
      px(20, 30, 0x4a1010, 8, 1);
      px(19, 31, 0x4a1010, 1, 1);
      px(28, 31, 0x4a1010, 1, 1);
    } else {
      // Sunken zombie eyes, frown, stink lines
      px(19, 23 + slump, 0x2a2a2a, 4, 3);
      px(25, 23 + slump, 0x2a2a2a, 4, 3);
      px(20, 24 + slump, eye, 2, 1);
      px(26, 24 + slump, eye, 2, 1);
      px(20, 31 + slump, 0x2a1a10, 8, 1);
      px(19, 30 + slump, 0x2a1a10, 1, 1);
      px(28, 30 + slump, 0x2a1a10, 1, 1);
      // Stink wisps drifting up from the head
      px(14, 14 + slump, 0x6a8a60, 1, 4);
      px(33, 14 + slump, 0x6a8a60, 1, 4);
      px(13, 12 + slump, 0x6a8a60, 1, 2);
      px(34, 12 + slump, 0x6a8a60, 1, 2);
    }

    g.generateTexture(key, 48, 80);
    g.destroy();
  }

  makeBurstTexture() {
    // 8-pointed sparkle for hit impacts
    const g = this.add.graphics();
    const cx = 24, cy = 24;
    g.fillStyle(0xffe066, 1);
    g.fillTriangle(cx, cy - 22, cx - 4, cy, cx + 4, cy);
    g.fillTriangle(cx, cy + 22, cx - 4, cy, cx + 4, cy);
    g.fillTriangle(cx - 22, cy, cx, cy - 4, cx, cy + 4);
    g.fillTriangle(cx + 22, cy, cx, cy - 4, cx, cy + 4);
    g.fillStyle(0xff8040, 1);
    g.fillTriangle(cx - 14, cy - 14, cx - 2, cy - 2, cx + 2, cy + 2);
    g.fillTriangle(cx + 14, cy + 14, cx - 2, cy - 2, cx + 2, cy + 2);
    g.fillTriangle(cx + 14, cy - 14, cx - 2, cy + 2, cx + 2, cy - 2);
    g.fillTriangle(cx - 14, cy + 14, cx - 2, cy + 2, cx + 2, cy - 2);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx, cy, 4);
    g.generateTexture('burst', 48, 48);
    g.destroy();
  }

  // =====================================================================
  // Background — single bitmap from the level config, anchored top-left.
  // =====================================================================

  buildBackground() {
    // Stretch bg image to fill the world dimensions
    this.worldAdd(
      this.add.image(0, 0, this.level.bg.key)
        .setOrigin(0, 0)
        .setDisplaySize(this.worldW, this.worldH)
        .setDepth(0)
    );
  }

  // =====================================================================
  // HUD
  // =====================================================================

  createHUD() {
    // HUD is rendered by the UI camera, so positions are in screen pixels.
    // W/H are read fresh each rebuild so the layout adapts to window size.
    this.W = this.scale.width;
    this.H = this.scale.height;
    // Scale HUD with screen height so it stays readable on big monitors.
    const u = this.uiScale = Math.max(1, this.H / 540);
    this._hudU = u;
    const fs = (px) => `${Math.round(px * u)}px`;

    const HUD = (obj) => { this.uiLayer.add(obj); return obj; };

    // Top strip
    const strip = HUD(this.add.graphics()).setDepth(50);
    strip.fillStyle(0x000000, 0.45);
    strip.fillRect(0, 0, this.W, 40 * u);

    // Player portrait box
    const portrait = HUD(this.add.graphics()).setDepth(51);
    portrait.fillStyle(0x1a0a08, 1); portrait.fillRect(8 * u, 6 * u, 32 * u, 30 * u);
    portrait.lineStyle(1, 0xe8d4a0, 1); portrait.strokeRect(8 * u, 6 * u, 32 * u, 30 * u);
    portrait.fillStyle(COLORS.pSkin, 1); portrait.fillRect(14 * u, 16 * u, 20 * u, 16 * u);
    portrait.fillStyle(COLORS.pHair, 1); portrait.fillRect(14 * u, 13 * u, 20 * u, 6 * u);
    portrait.fillStyle(0x1a0a05, 1);
    portrait.fillRect(18 * u, 23 * u, 2 * u, 1 * u);
    portrait.fillRect(28 * u, 23 * u, 2 * u, 1 * u);

    HUD(this.add.text(46 * u, 5 * u, '1P', {
      fontFamily: 'Courier New, monospace',
      fontSize: fs(12), color: '#e83838', fontStyle: 'bold'
    })).setDepth(52);
    HUD(this.add.text(46 * u, 19 * u, 'MOOD', {
      fontFamily: 'Courier New, monospace',
      fontSize: fs(9), color: '#e8d4a0'
    })).setDepth(52);

    // Mood bar
    const frame = HUD(this.add.graphics()).setDepth(52);
    frame.lineStyle(1, 0xe8d4a0, 1);
    frame.strokeRect(85 * u, 19 * u, 160 * u, 10 * u);
    this.moodBar = HUD(this.add.graphics()).setDepth(52);

    // Score (top center)
    HUD(this.add.text(this.W / 2, 5 * u, 'SCORE', {
      fontFamily: 'Courier New, monospace',
      fontSize: fs(10), color: '#e8b040', fontStyle: 'bold'
    })).setOrigin(0.5, 0).setDepth(52);
    this.scoreText = HUD(this.add.text(this.W / 2, 17 * u, '0000000', {
      fontFamily: 'Courier New, monospace',
      fontSize: fs(14), color: '#ffe066', fontStyle: 'bold'
    })).setOrigin(0.5, 0).setDepth(52);

    // Wave (top right)
    this.waveText = HUD(this.add.text(this.W - 12 * u, 8 * u, 'WAVE -/-', {
      fontFamily: 'Courier New, monospace',
      fontSize: fs(12), color: '#e8d4a0', fontStyle: 'bold'
    })).setOrigin(1, 0).setDepth(52);
    if (this.waveIndex > 0) this.waveText.setText(`WAVE ${this.waveIndex}/${this.waves.length}`);

    // Level label (bottom)
    HUD(this.add.text(this.W / 2, this.H - 18 * u, this.level.name, {
      fontFamily: 'Courier New, monospace',
      fontSize: fs(12), color: '#e8d4a0'
    })).setOrigin(0.5, 0).setDepth(52);

    // Center message (used for wave intro / game over / clear)
    this.centerMsg = HUD(this.add.text(this.W / 2, this.H / 2 - 30 * u, '', {
      fontFamily: 'Courier New, monospace',
      fontSize: fs(34), color: '#ffe066',
      stroke: '#1a0a0a', strokeThickness: 6, fontStyle: 'bold'
    })).setOrigin(0.5).setDepth(60).setVisible(false);
    this.subMsg = HUD(this.add.text(this.W / 2, this.H / 2 + 12 * u, '', {
      fontFamily: 'Courier New, monospace',
      fontSize: fs(14), color: '#e8d4a0',
      stroke: '#1a0a0a', strokeThickness: 4
    })).setOrigin(0.5).setDepth(60).setVisible(false);

    this.updateMoodBar();
    this.updateScore();
  }

  updateMoodBar() {
    const u = this._hudU || 1;
    const ratio = Phaser.Math.Clamp(this.player.mood / this.player.maxMood, 0, 1);
    this.moodBar.clear();
    this.moodBar.fillStyle(0x303030, 1);
    this.moodBar.fillRect(86 * u, 20 * u, 158 * u, 8 * u);
    const color = ratio < 0.3 ? 0xa01010 : (ratio < 0.6 ? 0xe87038 : 0xe83838);
    this.moodBar.fillStyle(color, 1);
    this.moodBar.fillRect(86 * u, 20 * u, 158 * u * ratio, 8 * u);
  }

  updateScore() {
    this.scoreText.setText(this.score.toString().padStart(7, '0'));
  }

  showCenterMessage(main, sub, color = '#ffe066') {
    this.centerMsg.setText(main).setColor(color).setVisible(true);
    this.subMsg.setText(sub).setVisible(true);
  }

  hideCenterMessage() {
    this.centerMsg.setVisible(false);
    this.subMsg.setVisible(false);
  }

  // =====================================================================
  // Wave & enemy management
  // =====================================================================

  spawnNextWave() {
    if (this.gameState !== 'playing') return;
    if (this.waveIndex >= this.waves.length) { this.levelCleared(); return; }

    const wave = this.waves[this.waveIndex];
    this.waveIndex++;
    this.enemiesToSpawn = wave.count;
    this.waveText.setText(`WAVE ${this.waveIndex}/${this.waves.length}`);
    this.showCenterMessage(`WAVE ${this.waveIndex}`, 'BAD VIBES INCOMING', '#ff8040');

    this.time.delayedCall(1200, () => {
      if (this.gameState !== 'playing') return;
      this.hideCenterMessage();
      for (let i = 0; i < wave.count; i++) {
        this.time.delayedCall(i * wave.delay, () => this.spawnEnemy());
      }
    });
  }

  spawnEnemy() {
    if (this.gameState !== 'playing') return;
    this.enemiesToSpawn = Math.max(0, this.enemiesToSpawn - 1);

    // Spawn just off the visible world rectangle (cam.worldView accounts for zoom)
    const view = this.cameras.main.worldView;
    const fromLeft = Math.random() < 0.5;
    const x = fromLeft ? view.x - 40 : view.right + 40;
    const y = Phaser.Math.Between(this.floorTop + 20, this.floorBottom - 10);
    const e = this.physics.add.sprite(x, y, 'zombie_walk1');
    e.setOrigin(0.5, 1.0);                    // y = feet position (matches player)
    e.setScale(this.characterScale);
    e.body.setSize(36, 30).setOffset(6, 50);
    e.state = 'attacking';                       // 'attacking' | 'transformed'
    e.speed = Phaser.Math.Between(28, 42) * this.characterScale;
    e.hp = 1;
    e.hitFlash = 0;
    e.attackCooldown = 0;
    e.walkPhase = Math.random() * 1000;
    this.enemies.add(e);
    this.worldAdd(e);
    this.activeEnemies++;
  }

  // =====================================================================
  // Per-frame update
  // =====================================================================

  update(time, dt) {
    if (this.gameState === 'playing') {
      this.handleMovement(dt);
      this.handleAttack(dt);
      this.updateEnemies(dt);
      this.updateMoodBar();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyR)) this.scene.restart({ level: this.levelIndex, score: this.score });
  }

  handleMovement(dt) {
    const p = this.player;
    if (p.cooldown > 0) p.cooldown -= dt;
    if (p.invuln > 0)   p.invuln -= dt;

    if (p.attackTimer > 0) {
      p.attackTimer -= dt;
      if (p.attackTimer <= 0) {
        p.attacking = false;
        this.attackBox.body.enable = false;
        this.attackText.setVisible(false);
      }
    }

    let vx = 0, vy = 0;
    const speed = 90 * this.characterScale;
    if (!p.attacking) {
      if (this.cursors.left.isDown  || this.keysWASD.A.isDown) vx = -speed;
      else if (this.cursors.right.isDown || this.keysWASD.D.isDown) vx =  speed;
      if (this.cursors.up.isDown    || this.keysWASD.W.isDown) vy = -speed * 0.75;
      else if (this.cursors.down.isDown  || this.keysWASD.S.isDown) vy =  speed * 0.75;
    }
    p.body.setVelocity(vx, vy);

    // Constrain to floor depth band + horizontal bounds
    if (p.y < this.floorTop)     p.y = this.floorTop;
    if (p.y > this.floorBottom)  p.y = this.floorBottom;
    const margin = 24 * this.characterScale; // half sprite-width
    if (p.x < margin)               p.x = margin;
    if (p.x > this.worldW - margin) p.x = this.worldW - margin;

    // Pseudo-3D: deeper rows render below closer rows
    p.setDepth(p.y);

    // Facing
    if (vx > 0) p.facing = 1;
    else if (vx < 0) p.facing = -1;
    p.setFlipX(p.facing < 0);

    // Walk-cycle (idle ↔ walk frames)
    if (!p.attacking) {
      if (vx !== 0 || vy !== 0) {
        p.walkPhase += dt;
        const f = Math.floor(p.walkPhase / 120) % 2;
        p.setTexture(f === 0 ? 'player_idle' : 'player_walk');
      } else {
        p.setTexture('player_idle');
      }
    }

    // Invuln flicker
    p.alpha = (p.invuln > 0 && Math.floor(p.invuln / 80) % 2 === 0) ? 0.4 : 1;
  }

  handleAttack(dt) {
    const p = this.player;

    if (Phaser.Input.Keyboard.JustDown(this.keySpace) && p.cooldown <= 0 && !p.attacking) {
      p.attacking = true;
      p.attackTimer = 220;
      p.cooldown = 320;
      p.setTexture('player_attack');
      this.currentAttackHits.clear();

      // Position the hitbox at the player's hand height (~midbody, slightly above center).
      // With origin (0.5, 1.0): sprite center = p.y - spriteH/2, "hand" ≈ p.y - spriteH * 0.55
      const offX = p.facing * 30 * this.characterScale;
      const handY = p.y - this.spriteH * 0.55;
      this.attackBox.x = p.x + offX;
      this.attackBox.y = handY;
      this.attackBox.body.enable = true;
      this.attackBox.body.reset(this.attackBox.x, this.attackBox.y);

      // "HIGH FIVE!" pop-in (above the player's head)
      this.attackText.setText('HIGH FIVE!').setVisible(true).setAlpha(1).setScale(0.3);
      this.attackText.x = p.x + offX;
      this.attackText.y = p.y - this.spriteH - 10;
      this.tweens.add({
        targets: this.attackText, scale: 1.1, duration: 100, ease: 'Back.easeOut'
      });
      this.tweens.add({
        targets: this.attackText, y: p.y - this.spriteH - 30, alpha: 0.6,
        duration: 220, delay: 60
      });
    }

    if (p.attacking) {
      const offX = p.facing * 30 * this.characterScale;
      this.attackBox.x = p.x + offX;
      this.attackBox.y = p.y - this.spriteH * 0.55;
      if (this.attackBox.body.enable) {
        this.attackBox.body.reset(this.attackBox.x, this.attackBox.y);
      }
    }
  }

  updateEnemies(dt) {
    const p = this.player;
    this.enemies.children.each(e => {
      if (!e.active) return;

      if (e.state === 'attacking') {
        if (e.attackCooldown > 0) e.attackCooldown -= dt;

        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        e.facing = dx > 0 ? 1 : -1;
        e.setFlipX(e.facing > 0);

        if (dist > 8 * this.characterScale) {
          e.body.setVelocity((dx / dist) * e.speed, (dy / dist) * e.speed * 0.7);
        } else {
          e.body.setVelocity(0, 0);
        }

        // Walk-cycle
        e.walkPhase += dt;
        const f = Math.floor(e.walkPhase / 180) % 2;
        e.setTexture(f === 0 ? 'zombie_walk1' : 'zombie_walk2');

        // Hit flash decay
        if (e.hitFlash > 0) {
          e.hitFlash -= dt;
          e.setTint(0xffffff);
          if (e.hitFlash <= 0) e.clearTint();
        }
      } else if (e.state === 'transformed') {
        // Walk off-screen toward the nearest exit, bobbing happily
        e.body.setVelocity(e.exitDir * 30 * this.characterScale, 0);
        e.walkPhase += dt;
        const f = Math.floor(e.walkPhase / 180) % 2;
        e.setTexture(f === 0 ? 'zombie_happy' : 'zombie_happy');
        e.y = e.transformedBaseY + Math.sin(e.walkPhase / 90) * (this.characterScale * 0.8);
        e.setFlipX(e.exitDir > 0);
        if (e.x < -60 || e.x > this.worldW + 60) {
          this.activeEnemies--;
          e.destroy();
          this.checkWaveComplete();
          return;
        }
      }

      // Clamp to floor band
      if (e.state === 'attacking') {
        if (e.y < this.floorTop)    e.y = this.floorTop;
        if (e.y > this.floorBottom) e.y = this.floorBottom;
      }
      e.setDepth(e.y);
    });
  }

  // =====================================================================
  // Combat resolution
  // =====================================================================

  handleHit(_box, enemy) {
    if (enemy.state !== 'attacking') return;
    if (this.currentAttackHits.has(enemy)) return; // one hit per swing per enemy
    this.currentAttackHits.add(enemy);

    enemy.hp--;
    enemy.hitFlash = 120;

    // Knockback
    const dir = this.player.facing;
    enemy.body.setVelocity(dir * 60 * this.characterScale, -12 * this.characterScale);

    this.spawnBurst(enemy.x, enemy.y - this.spriteH * 0.55);
    this.cameras.main.shake(50, 0.003);

    this.score += 50;
    this.updateScore();

    if (enemy.hp <= 0) this.transformEnemy(enemy);
  }

  spawnBurst(x, y) {
    const burstStart = 0.5 * this.characterScale;
    const burstEnd   = 1.5 * this.characterScale;
    const b = this.worldAdd(this.add.sprite(x, y, 'burst').setDepth(700).setScale(burstStart));
    this.tweens.add({
      targets: b, scale: burstEnd, alpha: 0, duration: 280,
      onComplete: () => b.destroy()
    });
    // Hearts / sparkles flying out
    const symbols = ['<3', '*', '~', '!'];
    const colors  = ['#ff5577', '#ffe066', '#80d8ff', '#80ff80'];
    const radius  = 44 * this.characterScale * 0.6;
    for (let i = 0; i < 7; i++) {
      const t = this.worldAdd(this.add.text(x, y, symbols[i % symbols.length], {
        fontFamily: 'Courier New, monospace',
        fontSize: `${Math.round(14 * this.characterScale * 0.5)}px`,
        color: colors[i % colors.length], fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(701));
      const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
      this.tweens.add({
        targets: t,
        x: x + Math.cos(a) * radius,
        y: y + Math.sin(a) * radius - 20,
        alpha: 0, duration: 600,
        onComplete: () => t.destroy()
      });
    }
  }

  transformEnemy(e) {
    e.state = 'transformed';
    e.setTexture('zombie_happy');
    e.body.setVelocity(0, 0);
    e.exitDir = e.x < this.worldW / 2 ? -1 : 1;
    e.transformedBaseY = e.y;

    this.score += 200;
    this.updateScore();

    // "+200 GOOD VIBES!" floater (above the head)
    const headY = e.y - this.spriteH;
    const t = this.worldAdd(this.add.text(e.x, headY - 6, '+200 GOOD VIBES!', {
      fontFamily: 'Courier New, monospace',
      fontSize: `${Math.round(12 * this.characterScale * 0.5)}px`,
      color: '#80ff80', stroke: '#0a3010', strokeThickness: 3, fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(800));
    this.tweens.add({
      targets: t, y: headY - 60, alpha: 0, duration: 900,
      onComplete: () => t.destroy()
    });

    // Triple burst for emphasis (around the chest/head area)
    const chestY = e.y - this.spriteH * 0.55;
    this.spawnBurst(e.x, chestY);
    this.spawnBurst(e.x - 16, chestY - 14);
    this.spawnBurst(e.x + 16, chestY + 6);

    // Quick happy hop
    this.tweens.add({
      targets: e, y: e.y - 10, yoyo: true, repeat: 1, duration: 140
    });
  }

  handleContact(player, enemy) {
    if (enemy.state !== 'attacking') return;
    if (player.invuln > 0) return;
    if (enemy.attackCooldown > 0) return;

    player.mood -= 10;
    player.invuln = 800;
    enemy.attackCooldown = 1000;
    this.cameras.main.shake(120, 0.006);

    const dir = player.x < enemy.x ? -1 : 1;
    player.body.setVelocity(dir * 65 * this.characterScale, -15 * this.characterScale);

    const headY = player.y - this.spriteH;
    const t = this.worldAdd(this.add.text(player.x, headY - 6, '-10 MOOD', {
      fontFamily: 'Courier New, monospace',
      fontSize: `${Math.round(12 * this.characterScale * 0.5)}px`,
      color: '#ff4040', stroke: '#1a0a0a', strokeThickness: 3, fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(800));
    this.tweens.add({
      targets: t, y: headY - 50, alpha: 0, duration: 700,
      onComplete: () => t.destroy()
    });

    if (player.mood <= 0) {
      player.mood = 0;
      this.gameOver();
    }
  }

  // =====================================================================
  // State transitions
  // =====================================================================

  checkWaveComplete() {
    if (this.gameState !== 'playing') return;
    if (this.activeEnemies > 0)         return;
    if (this.enemiesToSpawn > 0)        return;
    let stillAttacking = 0;
    this.enemies.children.each(e => {
      if (e.active && e.state === 'attacking') stillAttacking++;
    });
    if (stillAttacking > 0) return;
    this.time.delayedCall(700, () => this.spawnNextWave());
  }

  gameOver() {
    this.gameState = 'gameover';
    this.player.body.setVelocity(0, 0);
    this.attackBox.body.enable = false;
    this.showCenterMessage('BAD VIBES WIN', 'PRESS R TO TRY AGAIN', '#ff4040');
  }

  levelCleared() {
    this.gameState = 'cleared';
    this.player.body.setVelocity(0, 0);
    this.attackBox.body.enable = false;

    const nextIndex = this.levelIndex + 1;
    if (nextIndex < LEVELS.length) {
      // More levels — show "LEVEL CLEAR" then advance.
      this.showCenterMessage('LEVEL CLEAR', `NEXT: ${LEVELS[nextIndex].name}`, '#80ff80');
      this.time.delayedCall(2200, () => this.scene.restart({ level: nextIndex, score: this.score }));
    } else {
      // Final level — full victory screen.
      this.showCenterMessage('GOOD VIBES ONLY',
        `SCORE: ${this.score.toString().padStart(7, '0')} — PRESS R TO REPLAY`, '#80ff80');
    }
  }
}

// =====================================================================
// Phaser bootstrap
// =====================================================================

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#0a0408',
  pixelArt: true,
  scale: {
    // Canvas matches the parent (full browser window). World/character
    // dimensions are derived from the actual screen size in GameScene.create(),
    // so no camera zoom is needed.
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%'
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false }
  },
  scene: [GameScene]
};

new Phaser.Game(config);
