import * as Phaser from 'phaser';
import VirtualJoystick from 'phaser3-rex-plugins/plugins/virtualjoystick.js';

export enum ControlScheme {
    KEYBOARD_MOUSE = 'keyboard_mouse',
    GAMEPAD = 'gamepad',
    TOUCH = 'touch'
}

export interface AbstractInputState {
    movement: Phaser.Math.Vector2;  // Normalized direction
    aim: Phaser.Math.Vector2;       // World coordinates
    ability1: boolean;
    ability2: boolean;
}

export class ButtonMapper {
    private scene: Phaser.Scene;
    private currentScheme: ControlScheme;
    private keys: any;
    private gamepad: Phaser.Input.Gamepad.Gamepad | null = null;
    private keyboardInitialized: boolean = false;
    private setupRetryCount: number = 0;
    private maxRetries: number = 50;  // Try for up to 5 seconds (50 * 100ms)

    // Mapping dictionaries for remappable controls
    // Action -> button index
    private keyboardMap: Map<string, number> = new Map();
    private gamepadMap: Map<string, number> = new Map();

    // Virtual joystick for mobile
    private joystick: any = null;
    private ability1Button: Phaser.GameObjects.Container | null = null;
    private ability2Button: Phaser.GameObjects.Container | null = null;
    private ability1Pressed: boolean = false;
    private ability2Pressed: boolean = false;
    
    // Multi-touch support
    private ability1Circle: Phaser.GameObjects.Arc | null = null;
    private ability2Circle: Phaser.GameObjects.Arc | null = null;
    private activeTouches: Map<number, string> = new Map(); // touchId -> 'ability1' | 'ability2' | 'joystick'

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.keys = {};  // Initialize as empty object to prevent undefined errors
        this.initializeDefaultMappings();
        this.detectControlScheme();
        this.setupKeyboard();
        this.setupGamepad();
        this.setupTouch();
        this.setupFocusListener();

        // Prevent the browser context menu from appearing on right-click so the game can use the right mouse button
        this.scene.input.mouse?.disableContextMenu();
    }

    private initializeDefaultMappings(): void {
        // Keyboard defaults (can be changed later for settings)
        this.keyboardMap.set('moveLeft', Phaser.Input.Keyboard.KeyCodes.A);
        this.keyboardMap.set('moveRight', Phaser.Input.Keyboard.KeyCodes.D);
        this.keyboardMap.set('moveUp', Phaser.Input.Keyboard.KeyCodes.W);
        this.keyboardMap.set('moveDown', Phaser.Input.Keyboard.KeyCodes.S);
        this.keyboardMap.set('ability1', Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.keyboardMap.set('ability2', Phaser.Input.Keyboard.KeyCodes.SHIFT);

        // Gamepad defaults (button indices)
        this.gamepadMap.set('ability1', 0);  // A button
        this.gamepadMap.set('ability2', 1);  // B button
    }

    // Allow remapping keys (for future settings menu)
    remapKey(action: string, keyCode: number): void {
        this.keyboardMap.set(action, keyCode);
        this.setupKeyboard();  // Re-setup with new mappings
    }

    remapGamepadButton(action: string, buttonIndex: number): void {
        this.gamepadMap.set(action, buttonIndex);
    }

    private detectControlScheme(): void {
        // Check if running on mobile/touch device
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        // Prefer gamepad if connected
        if (this.scene.input.gamepad && this.scene.input.gamepad.total > 0) {
            this.currentScheme = ControlScheme.GAMEPAD;
        }
        // Prefer keyboard/mouse on desktop (even with touch screen like laptops)
        else if (this.scene.input.keyboard && !isMobile) {
            this.currentScheme = ControlScheme.KEYBOARD_MOUSE;
        }
        // Use touch only on actual mobile devices
        else if (isMobile || hasTouchScreen) {
            this.currentScheme = ControlScheme.TOUCH;
        }
        // Final fallback
        else {
            this.currentScheme = ControlScheme.KEYBOARD_MOUSE;
        }
        
        console.log('ButtonMapper: Control scheme detected:', this.currentScheme, {
            isMobile,
            hasTouchScreen,
            hasKeyboard: !!this.scene.input.keyboard,
            hasGamepad: this.scene.input.gamepad?.total || 0
        });
    }

    private setupKeyboard(): void {
        // Always try to set up keyboard (for hybrid devices and desktop emulation)
        if (!this.scene.input.keyboard) {
            this.setupRetryCount++;

            if (this.setupRetryCount <= this.maxRetries) {
                console.warn(`ButtonMapper: Keyboard input not available, retrying... (attempt ${this.setupRetryCount}/${this.maxRetries})`);
                // Initialize with empty object to prevent undefined access
                this.keys = {};

                // Retry setup
                this.scene.time.delayedCall(100, () => {
                    this.setupKeyboard();
                });
            } else {
                console.error('ButtonMapper: Keyboard initialization failed after max retries. Using empty input.');
                this.keys = {};  // Ensure keys is initialized even on failure
            }
            return;
        }

        // Enable keyboard input (Phaser sometimes needs this explicitly)
        // Note: Phaser 3 doesn't have a global preventDefault method
        // Individual keys should have their events prevented if needed

        // Register each key individually (addKeys was causing all keys to share same object)
        this.keys = {
            moveLeft: this.scene.input.keyboard.addKey(this.keyboardMap.get('moveLeft')!),
            moveRight: this.scene.input.keyboard.addKey(this.keyboardMap.get('moveRight')!),
            moveUp: this.scene.input.keyboard.addKey(this.keyboardMap.get('moveUp')!),
            moveDown: this.scene.input.keyboard.addKey(this.keyboardMap.get('moveDown')!),
            ability1: this.scene.input.keyboard.addKey(this.keyboardMap.get('ability1')!),
            ability2: this.scene.input.keyboard.addKey(this.keyboardMap.get('ability2')!)
        };

        this.keyboardInitialized = true;
        this.setupRetryCount = 0;  // Reset counter on success

        console.debug('ButtonMapper: Keyboard input initialized successfully');
    }

    private setupFocusListener(): void {
        // Reinitialize keyboard when window gains focus (fixes tab-in issue)
        window.addEventListener('focus', () => {
            if (!this.keyboardInitialized && this.scene.input.keyboard) {
                console.debug('ButtonMapper: Window gained focus, reinitializing keyboard...');
                this.setupRetryCount = 0;  // Reset retry counter
                this.setupKeyboard();
            }
        });
    }

    private setupGamepad(): void {
        this.scene.input.gamepad?.on('connected', (pad: Phaser.Input.Gamepad.Gamepad) => {
            this.gamepad = pad;
            this.currentScheme = ControlScheme.GAMEPAD;
        });
    }

    private setupTouch(): void {
        if (this.currentScheme !== ControlScheme.TOUCH) {
            return;
        }

        const width = this.scene.scale.width;
        const height = this.scene.scale.height;

        // Create base and thumb sprites first, then set their properties
        const baseSprite = this.scene.add.circle(0, 0, 50, 0x888888, 0.5);
        baseSprite.setScrollFactor(0);
        baseSprite.setDepth(1000);
        
        const thumbSprite = this.scene.add.circle(0, 0, 25, 0xcccccc, 0.8);
        thumbSprite.setScrollFactor(0);
        thumbSprite.setDepth(1001);

        // Create virtual joystick for movement (bottom-left)
        this.joystick = new VirtualJoystick(this.scene, {
            x: 100,
            y: height - 100,
            radius: 50,
            base: baseSprite,
            thumb: thumbSprite,
            dir: '8dir',
            forceMin: 16,
            enable: true
        });

        // Create ability buttons (bottom-right)
        const buttonRadius = 40;
        const buttonSpacing = 100;
        const buttonBaseX = width - 80;
        const buttonBaseY = height - 100;

        // Ability 1 button (left button, primary ability)
        this.ability1Button = this.scene.add.container(buttonBaseX - buttonSpacing, buttonBaseY);
        this.ability1Circle = this.scene.add.circle(0, 0, buttonRadius, 0xff6666, 0.5);
        const ability1Text = this.scene.add.text(0, 0, '1', {
            fontSize: '24px',
            color: '#ffffff'
        }).setOrigin(0.5);
        this.ability1Button.add([this.ability1Circle, ability1Text]);
        this.ability1Button.setScrollFactor(0);
        this.ability1Button.setDepth(1000);
        this.ability1Button.setSize(buttonRadius * 2, buttonRadius * 2);
        this.ability1Button.setInteractive(new Phaser.Geom.Circle(0, 0, buttonRadius), Phaser.Geom.Circle.Contains);

        // Ability 2 button (right button, secondary ability)
        this.ability2Button = this.scene.add.container(buttonBaseX, buttonBaseY);
        this.ability2Circle = this.scene.add.circle(0, 0, buttonRadius, 0x6666ff, 0.5);
        const ability2Text = this.scene.add.text(0, 0, '2', {
            fontSize: '24px',
            color: '#ffffff'
        }).setOrigin(0.5);
        this.ability2Button.add([this.ability2Circle, ability2Text]);
        this.ability2Button.setScrollFactor(0);
        this.ability2Button.setDepth(1000);
        this.ability2Button.setSize(buttonRadius * 2, buttonRadius * 2);
        this.ability2Button.setInteractive(new Phaser.Geom.Circle(0, 0, buttonRadius), Phaser.Geom.Circle.Contains);

        // Set up multi-touch event handlers on the canvas
        // This allows simultaneous joystick and button presses with different fingers
        const canvas = this.scene.game.canvas;
        
        const handleTouchStart = (e: TouchEvent) => {
            e.preventDefault();
            
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                const touchId = touch.identifier;
                
                // Convert touch coordinates to game coordinates
                const rect = canvas.getBoundingClientRect();
                const scaleX = this.scene.scale.width / rect.width;
                const scaleY = this.scene.scale.height / rect.height;
                const x = (touch.clientX - rect.left) * scaleX;
                const y = (touch.clientY - rect.top) * scaleY;
                
                // Check if touch is on ability 1 button
                if (this.ability1Button) {
                    const dx = x - this.ability1Button.x;
                    const dy = y - this.ability1Button.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= buttonRadius) {
                        this.activeTouches.set(touchId, 'ability1');
                        this.ability1Pressed = true;
                        this.ability1Circle?.setAlpha(0.8);
                        console.debug('[ButtonMapper] Ability 1 pressed (touch)', touchId);
                        continue;
                    }
                }
                
                // Check if touch is on ability 2 button
                if (this.ability2Button) {
                    const dx = x - this.ability2Button.x;
                    const dy = y - this.ability2Button.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= buttonRadius) {
                        this.activeTouches.set(touchId, 'ability2');
                        this.ability2Pressed = true;
                        this.ability2Circle?.setAlpha(0.8);
                        console.debug('[ButtonMapper] Ability 2 pressed (touch)', touchId);
                        continue;
                    }
                }
                
                // If not on buttons, mark as joystick touch
                this.activeTouches.set(touchId, 'joystick');
            }
        };
        
        const handleTouchEnd = (e: TouchEvent) => {
            e.preventDefault();
            
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                const touchId = touch.identifier;
                const touchType = this.activeTouches.get(touchId);
                
                if (touchType === 'ability1') {
                    this.ability1Pressed = false;
                    this.ability1Circle?.setAlpha(0.5);
                    console.debug('[ButtonMapper] Ability 1 released (touch)', touchId);
                } else if (touchType === 'ability2') {
                    this.ability2Pressed = false;
                    this.ability2Circle?.setAlpha(0.5);
                    console.debug('[ButtonMapper] Ability 2 released (touch)', touchId);
                }
                
                this.activeTouches.delete(touchId);
            }
        };
        
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
        canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

        console.log('ButtonMapper: Virtual joystick and ability buttons initialized for multi-touch controls');
    }

    getInput(): AbstractInputState {
        // If keyboard isn't initialized yet, try to initialize it now
        if (!this.keyboardInitialized && this.scene.input.keyboard) {
            this.setupKeyboard();
        }

        // Strictly use the detected control scheme without dynamic switching
        // This ensures proper testing of each input method
        switch (this.currentScheme) {
            case ControlScheme.KEYBOARD_MOUSE:
                return this.getKeyboardMouseInput();
            case ControlScheme.GAMEPAD:
                return this.getGamepadInput();
            case ControlScheme.TOUCH:
                return this.getTouchInput();
        }
    }

    private getKeyboardMouseInput(): AbstractInputState {
        const movement = new Phaser.Math.Vector2(0, 0);

        // Read from mapped keys (with safety check)
        if (this.keys) {
            if (this.keys.moveLeft?.isDown) {
                movement.x -= 1;
            }
            if (this.keys.moveRight?.isDown) {
                movement.x += 1;
            }
            if (this.keys.moveUp?.isDown) {
                movement.y -= 1;
            }
            if (this.keys.moveDown?.isDown) {
                movement.y += 1;
            }
        }

        movement.normalize();

        const worldPoints = this.scene.cameras.main.getWorldPoint(this.scene.input.mousePointer.x, this.scene.input.mousePointer.y);
        const aim = new Phaser.Math.Vector2(worldPoints);

        // Read mouse buttons: left click => ability1, right click => ability2
        const pointer = this.scene.input.activePointer;
        let leftMouseDown = false;
        let rightMouseDown = false;
        if (pointer) {
            // Use pointer helper methods if available (Phaser Pointer API)
            try {
                leftMouseDown = !!(pointer.leftButtonDown && pointer.leftButtonDown());
            } catch (e) {
                leftMouseDown = pointer.isDown && pointer.button === 0;
            }
            try {
                rightMouseDown = !!(pointer.rightButtonDown && pointer.rightButtonDown());
            } catch (e) {
                rightMouseDown = pointer.isDown && pointer.button === 2;
            }
        }

        return {
            movement,
            aim,
            ability1: (this.keys?.ability1?.isDown || false) || leftMouseDown,
            ability2: (this.keys?.ability2?.isDown || false) || rightMouseDown
        };
    }

    private getGamepadInput(): AbstractInputState {
        if (!this.gamepad) return this.getNullInput();

        const leftStick = this.gamepad.leftStick;
        const movement = new Phaser.Math.Vector2(leftStick.x, leftStick.y);

        const rightStick = this.gamepad.rightStick;
        const centerX = this.scene.scale.width / 2;
        const centerY = this.scene.scale.height / 2;
        const aim = new Phaser.Math.Vector2(
            centerX + rightStick.x * 200,
            centerY + rightStick.y * 200
        );

        // Read from mapped buttons
        const ability1ButtonIndex = this.gamepadMap.get('ability1') || 0;
        const ability2ButtonIndex = this.gamepadMap.get('ability2') || 1;

        return {
            movement,
            aim,
            ability1: this.gamepad.buttons[ability1ButtonIndex]?.pressed || false,
            ability2: this.gamepad.buttons[ability2ButtonIndex]?.pressed || false
        };
    }

    private getTouchInput(): AbstractInputState {
        if (!this.joystick) {
            return this.getNullInput();
        }

        // Get movement from joystick
        const movement = new Phaser.Math.Vector2(
            this.joystick.forceX || 0,
            this.joystick.forceY || 0
        );

        // Normalize if needed (joystick already normalizes, but ensure it's clamped)
        if (movement.length() > 1) {
            movement.normalize();
        }

        // For touch controls, we return the movement direction vector
        // The PlayerController will use this to calculate aim based on player position
        // Return null for aim to signal touch mode - PlayerController will handle it
        const aim = new Phaser.Math.Vector2(0, 0);  // Placeholder, will be calculated by PlayerController

        const inputState = {
            movement,
            aim,  // Will be overridden by PlayerController based on movement direction
            ability1: this.ability1Pressed,
            ability2: this.ability2Pressed
        };

        // Log input state periodically (every 60 frames to avoid spam)
        if (this.scene.game.getFrame() % 60 === 0 && (inputState.ability1 || inputState.ability2 || movement.length() > 0)) {
            console.debug('[ButtonMapper] Touch input state:', {
                movement: { x: movement.x.toFixed(2), y: movement.y.toFixed(2) },
                ability1: inputState.ability1,
                ability2: inputState.ability2
            });
        }

        return inputState;
    }

    private getNullInput(): AbstractInputState {
        return {
            movement: new Phaser.Math.Vector2(0, 0),
            aim: new Phaser.Math.Vector2(0, 0),
            ability1: false,
            ability2: false
        };
    }

    getCurrentScheme(): ControlScheme {
        return this.currentScheme;
    }

    isKeyboardInitialized(): boolean {
        return this.keyboardInitialized;
    }

    getDebugInfo(): any {
        return {
            scheme: this.currentScheme,
            keyboardInitialized: this.keyboardInitialized,
            keysRegistered: this.keys ? Object.keys(this.keys).length : 0,
            keysState: this.keys ? {
                moveLeft: this.keys.moveLeft?.isDown,
                moveRight: this.keys.moveRight?.isDown,
                moveUp: this.keys.moveUp?.isDown,
                moveDown: this.keys.moveDown?.isDown,
                ability1: this.keys.ability1?.isDown,
                ability2: this.keys.ability2?.isDown
            } : null,
            touchState: this.currentScheme === ControlScheme.TOUCH ? {
                joystickEnabled: !!this.joystick,
                ability1Pressed: this.ability1Pressed,
                ability2Pressed: this.ability2Pressed
            } : null
        };
    }

    destroy(): void {
        // Clean up virtual joystick and buttons
        if (this.joystick) {
            this.joystick.destroy();
            this.joystick = null;
        }
        if (this.ability1Button) {
            this.ability1Button.destroy();
            this.ability1Button = null;
        }
        if (this.ability2Button) {
            this.ability2Button.destroy();
            this.ability2Button = null;
        }
        
        // Clear touch tracking
        this.activeTouches.clear();
        this.ability1Circle = null;
        this.ability2Circle = null;
    }
}
