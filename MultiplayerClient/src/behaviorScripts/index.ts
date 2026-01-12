// Enemy Behaviors
export { IBehavior, Behavior } from './Behavior';
export { AggressiveBehavior } from './Aggressive';
export { IdleBehavior } from './Idle';
export { PacifistBehavior } from './Pacifist';
export { TerritorialBehavior } from './Territorial';

// Ally Behaviors (for CPU-controlled player characters)
export { IAllyBehavior, AllyBehavior } from './AllyBehavior';
export { FollowAndAttackBehavior } from './FollowAndAttack';

// Wave Mode Behaviors
export { KamikazeBehavior } from './KamikazeBehavior';
export { BossBehavior } from './BossBehavior';
