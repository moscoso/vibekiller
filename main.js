// =====================================================================
// Vibe Killer — v0.1
// A side-scrolling beat-em-up where you transform Bad Vibe Zombies into
// Good Vibes via the power of high-fives. Setting: bar "On the Rocks".
// All art is generated from primitives via Phaser.Graphics.generateTexture.
// =====================================================================

// =====================================================================
// Level data — add a new entry to ship a new level.
// `bg` points at an image asset; `floorTop/Bottom` define the walkable
// depth band (must match the perspective of the background art).
// =====================================================================
const LEVELS = [
  {
    id: '1-1',
    name: 'ON THE ROCKS — 1-1',
    bg: { key: 'bg_1_1', path: 'assets/bar-bg.png' },
    width: 2000,
    height: 666,
    floorTop: 430,
    floorBottom: 620,
    playerStart: { x: 260, y: 580 },
    waves: [
      { count: 2, delay: 900 },
      { count: 3, delay: 800 },
      { count: 4, delay: 700 }
    ]
  }
];

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
  }

  preload() {
    this.load.image(this.level.bg.key, this.level.bg.path);
  }

  create() {
    this.W = this.scale.width;
    this.H = this.scale.height;

    this.floorTop    = this.level.floorTop;
    this.floorBottom = this.level.floorBottom;

    this.createTextures();
    this.buildBackground();

    // ----- Player -----
    this.player = this.physics.add.sprite(this.level.playerStart.x, this.level.playerStart.y, 'player_idle');
    this.player.body.setSize(36, 30).setOffset(6, 50);
    this.player.mood = 100;
    this.player.maxMood = 100;
    this.player.attacking = false;
    this.player.attackTimer = 0;
    this.player.cooldown = 0;
    this.player.invuln = 0;
    this.player.facing = 1;
    this.player.walkPhase = 0;

    // Attack hitbox — invisible rect, enabled only during the attack window
    this.attackBox = this.add.rectangle(0, 0, 60, 38, 0xffe066, 0);
    this.physics.add.existing(this.attackBox);
    this.attackBox.body.setAllowGravity(false);
    this.attackBox.body.enable = false;

    // Tracks enemies hit by the *current* swing (so one swing = one hit per enemy)
    this.currentAttackHits = new Set();

    // "HIGH FIVE!" text that pops up when the player attacks
    this.attackText = this.add.text(0, 0, 'HIGH FIVE!', {
      fontFamily: 'Courier New, monospace',
      fontSize: '14px',
      color: '#ffe066',
      stroke: '#1a0a0a',
      strokeThickness: 4,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(900).setVisible(false);

    // ----- Enemies -----
    this.enemies = this.physics.add.group();
    this.activeEnemies = 0;
    this.enemiesToSpawn = 0;

    // ----- Game state -----
    this.score = 0;
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

    this.createHUD();

    // First wave starts shortly after scene load
    this.time.delayedCall(700, () => this.spawnNextWave());
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
    this.add.image(0, 0, this.level.bg.key)
      .setOrigin(0, 0)
      .setDisplaySize(this.W, this.H)
      .setDepth(0);
  }

  // =====================================================================
  // HUD
  // =====================================================================

  createHUD() {
    // Top strip
    const strip = this.add.graphics().setDepth(50);
    strip.fillStyle(0x000000, 0.45);
    strip.fillRect(0, 0, this.W, 40);

    // Player portrait box (matches concept-art top-left widget)
    const portrait = this.add.graphics().setDepth(51);
    portrait.fillStyle(0x1a0a08, 1); portrait.fillRect(8, 6, 32, 30);
    portrait.lineStyle(1, 0xe8d4a0, 1); portrait.strokeRect(8, 6, 32, 30);
    portrait.fillStyle(COLORS.pSkin, 1); portrait.fillRect(14, 16, 20, 16);
    portrait.fillStyle(COLORS.pHair, 1); portrait.fillRect(14, 13, 20, 6);
    portrait.fillStyle(0x1a0a05, 1);
    portrait.fillRect(18, 23, 2, 1);
    portrait.fillRect(28, 23, 2, 1);

    this.add.text(46, 5, '1P', {
      fontFamily: 'Courier New, monospace',
      fontSize: '12px', color: '#e83838', fontStyle: 'bold'
    }).setDepth(52);
    this.add.text(46, 19, 'MOOD', {
      fontFamily: 'Courier New, monospace',
      fontSize: '9px', color: '#e8d4a0'
    }).setDepth(52);

    // Mood bar
    const frame = this.add.graphics().setDepth(52);
    frame.lineStyle(1, 0xe8d4a0, 1);
    frame.strokeRect(85, 19, 160, 10);
    this.moodBar = this.add.graphics().setDepth(52);

    // Score (top center)
    this.add.text(this.W / 2, 5, 'SCORE', {
      fontFamily: 'Courier New, monospace',
      fontSize: '10px', color: '#e8b040', fontStyle: 'bold'
    }).setOrigin(0.5, 0).setDepth(52);
    this.scoreText = this.add.text(this.W / 2, 17, '0000000', {
      fontFamily: 'Courier New, monospace',
      fontSize: '14px', color: '#ffe066', fontStyle: 'bold'
    }).setOrigin(0.5, 0).setDepth(52);

    // Wave (top right)
    this.waveText = this.add.text(this.W - 12, 8, 'WAVE -/-', {
      fontFamily: 'Courier New, monospace',
      fontSize: '12px', color: '#e8d4a0', fontStyle: 'bold'
    }).setOrigin(1, 0).setDepth(52);

    // Level label (bottom)
    this.add.text(this.W / 2, this.H - 18, this.level.name, {
      fontFamily: 'Courier New, monospace',
      fontSize: '12px', color: '#e8d4a0'
    }).setOrigin(0.5, 0).setDepth(52);

    // Center message (used for wave intro / game over / clear)
    this.centerMsg = this.add.text(this.W / 2, this.H / 2 - 30, '', {
      fontFamily: 'Courier New, monospace',
      fontSize: '34px', color: '#ffe066',
      stroke: '#1a0a0a', strokeThickness: 6, fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(60).setVisible(false);
    this.subMsg = this.add.text(this.W / 2, this.H / 2 + 12, '', {
      fontFamily: 'Courier New, monospace',
      fontSize: '14px', color: '#e8d4a0',
      stroke: '#1a0a0a', strokeThickness: 4
    }).setOrigin(0.5).setDepth(60).setVisible(false);

    this.updateMoodBar();
    this.updateScore();
  }

  updateMoodBar() {
    const ratio = Phaser.Math.Clamp(this.player.mood / this.player.maxMood, 0, 1);
    this.moodBar.clear();
    this.moodBar.fillStyle(0x303030, 1);
    this.moodBar.fillRect(86, 20, 158, 8);
    const color = ratio < 0.3 ? 0xa01010 : (ratio < 0.6 ? 0xe87038 : 0xe83838);
    this.moodBar.fillStyle(color, 1);
    this.moodBar.fillRect(86, 20, 158 * ratio, 8);
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

    const fromLeft = Math.random() < 0.3;
    const x = fromLeft ? -40 : this.W + 40;
    const y = Phaser.Math.Between(this.floorTop + 20, this.floorBottom - 10);
    const e = this.physics.add.sprite(x, y, 'zombie_walk1');
    e.body.setSize(36, 30).setOffset(6, 50);
    e.state = 'attacking';                       // 'attacking' | 'transformed'
    e.speed = Phaser.Math.Between(85, 130);
    e.hp = 2;
    e.hitFlash = 0;
    e.attackCooldown = 0;
    e.walkPhase = Math.random() * 1000;
    this.enemies.add(e);
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
    if (Phaser.Input.Keyboard.JustDown(this.keyR)) this.scene.restart();
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
    const speed = 320;
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
    if (p.x < 30)                p.x = 30;
    if (p.x > this.W - 30)       p.x = this.W - 30;

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

      // Position the hitbox in front of the player
      const offX = p.facing * 30;
      this.attackBox.x = p.x + offX;
      this.attackBox.y = p.y - 8;
      this.attackBox.body.enable = true;
      this.attackBox.body.reset(this.attackBox.x, this.attackBox.y);

      // "HIGH FIVE!" pop-in
      this.attackText.setText('HIGH FIVE!').setVisible(true).setAlpha(1).setScale(0.3);
      this.attackText.x = p.x + offX;
      this.attackText.y = p.y - 60;
      this.tweens.add({
        targets: this.attackText, scale: 1.1, duration: 100, ease: 'Back.easeOut'
      });
      this.tweens.add({
        targets: this.attackText, y: p.y - 80, alpha: 0.6,
        duration: 220, delay: 60
      });
    }

    if (p.attacking) {
      const offX = p.facing * 30;
      this.attackBox.x = p.x + offX;
      this.attackBox.y = p.y - 8;
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

        if (dist > 26) {
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
        e.body.setVelocity(e.exitDir * 110, 0);
        e.walkPhase += dt;
        const f = Math.floor(e.walkPhase / 180) % 2;
        e.setTexture(f === 0 ? 'zombie_happy' : 'zombie_happy');
        e.y = e.transformedBaseY + Math.sin(e.walkPhase / 90) * 3;
        e.setFlipX(e.exitDir > 0);
        if (e.x < -60 || e.x > this.W + 60) {
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
    enemy.body.setVelocity(dir * 220, -40);

    this.spawnBurst(enemy.x, enemy.y - 20);
    this.cameras.main.shake(50, 0.003);

    this.score += 50;
    this.updateScore();

    if (enemy.hp <= 0) this.transformEnemy(enemy);
  }

  spawnBurst(x, y) {
    const b = this.add.sprite(x, y, 'burst').setDepth(700).setScale(0.5);
    this.tweens.add({
      targets: b, scale: 1.5, alpha: 0, duration: 280,
      onComplete: () => b.destroy()
    });
    // Hearts / sparkles flying out
    const symbols = ['<3', '*', '~', '!'];
    const colors  = ['#ff5577', '#ffe066', '#80d8ff', '#80ff80'];
    for (let i = 0; i < 7; i++) {
      const t = this.add.text(x, y, symbols[i % symbols.length], {
        fontFamily: 'Courier New, monospace',
        fontSize: '14px', color: colors[i % colors.length], fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(701);
      const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
      this.tweens.add({
        targets: t,
        x: x + Math.cos(a) * 44,
        y: y + Math.sin(a) * 44 - 20,
        alpha: 0, duration: 600,
        onComplete: () => t.destroy()
      });
    }
  }

  transformEnemy(e) {
    e.state = 'transformed';
    e.setTexture('zombie_happy');
    e.body.setVelocity(0, 0);
    e.exitDir = e.x < this.W / 2 ? -1 : 1;
    e.transformedBaseY = e.y;

    this.score += 200;
    this.updateScore();

    // "+200 GOOD VIBES!" floater
    const t = this.add.text(e.x, e.y - 40, '+200 GOOD VIBES!', {
      fontFamily: 'Courier New, monospace',
      fontSize: '12px', color: '#80ff80',
      stroke: '#0a3010', strokeThickness: 3, fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(800);
    this.tweens.add({
      targets: t, y: e.y - 90, alpha: 0, duration: 900,
      onComplete: () => t.destroy()
    });

    // Triple burst for emphasis
    this.spawnBurst(e.x, e.y - 20);
    this.spawnBurst(e.x - 16, e.y - 30);
    this.spawnBurst(e.x + 16, e.y - 10);

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
    player.body.setVelocity(dir * 240, -60);

    const t = this.add.text(player.x, player.y - 50, '-10 MOOD', {
      fontFamily: 'Courier New, monospace',
      fontSize: '12px', color: '#ff4040',
      stroke: '#1a0a0a', strokeThickness: 3, fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(800);
    this.tweens.add({
      targets: t, y: player.y - 90, alpha: 0, duration: 700,
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
    this.showCenterMessage('GOOD VIBES ONLY',
      `SCORE: ${this.score.toString().padStart(7, '0')} — PRESS R TO REPLAY`, '#80ff80');
  }
}

// =====================================================================
// Phaser bootstrap
// =====================================================================

const BOOT_LEVEL = LEVELS[0];

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#0a0408',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: BOOT_LEVEL.width,
    height: BOOT_LEVEL.height
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false }
  },
  scene: [GameScene]
};

new Phaser.Game(config);
