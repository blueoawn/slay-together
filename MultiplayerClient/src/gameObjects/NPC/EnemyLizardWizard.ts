import { EnemyController } from './EnemyController';
import { GameScene } from '../../scenes/GameScene';
import { IBehavior } from '../../behaviorScripts/Behavior';
import { AggressiveBehavior } from '../../behaviorScripts/Aggressive';
import ASSETS from '../../assets';

export default class EnemyLizardWizard extends EnemyController {
    private behavior: IBehavior;
    isBoss: boolean = false;

    constructor(scene: GameScene, x: number, y: number, behavior?: IBehavior, isBoss: boolean = false) {
        // Use the same lizardWizard texture as the player character
        super(scene, x, y, 0, ASSETS.image.lizardWizard.key);

        // Set enemy type for network sync
        this.enemyType = 'EnemyLizardWizard';
        this.isBoss = isBoss;

        // Match player lizard wizard scale (bosses are larger)
        const scale = isBoss ? 1.0 : 0.5;
        this.setScale(scale, scale);
        this.setBodySize(this.width, this.height);

        // Set enemy stats (bosses have more health)
        this.health = isBoss ? 50 : 5;
        this.maxHealth = isBoss ? 50 : 5;
        this.power = isBoss ? 2 : 1;

        // Enable physics body
        this.setCollideWorldBounds(true);

        // Set behavior (default to Aggressive if not provided)
        this.behavior = behavior || new AggressiveBehavior();

        // Initialize the behavior
        if (this.behavior.initialize) {
            this.behavior.initialize(this);
        }
    }

    protected updateAI(time: number, delta: number): void {
        this.behavior.update(this, time, delta);
    }

    setBehavior(newBehavior: IBehavior): void {
        // Cleanup old behavior
        if (this.behavior.cleanup) {
            this.behavior.cleanup(this);
        }

        // Set and initialize new behavior
        this.behavior = newBehavior;
        if (this.behavior.initialize) {
            this.behavior.initialize(this);
        }
    }

    getBehavior(): IBehavior {
        return this.behavior;
    }

    /**
     * Override die to add visual feedback and cleanup
     * Could also add loot drops here in the future, or companion spawn or whatever here
     */
    die(): void {
        // Cleanup behavior
        if (this.behavior.cleanup) {
            this.behavior.cleanup(this);
        }

        // Create explosion effect (placeholder death effect, will replace with animated sprite later)
        this.gameScene.addExplosion(this.x, this.y);

        // Remove from scene
        this.gameScene.removeEnemy(this);
    }
}
