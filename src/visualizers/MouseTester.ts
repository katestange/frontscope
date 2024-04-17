import {VisualizerExportModule} from '@/visualizers/VisualizerInterface'
import {VisualizerDefault} from './VisualizerDefault'

/** md
# Mouse Tester

**/

class MouseTesterVisualizer extends VisualizerDefault {
    name = 'Mouse Tester'
    colorValuePressed = 0
    colorValueReleased = 0
    colorValueKeyPressed = 0
    params = {}

    draw() {
        const downSet = 80
        const offset = 10
        this.sketch.textSize(20)

        this.sketch.text('press to change colour', downSet, downSet)
        this.sketch.fill(this.colorValuePressed)
        this.sketch.rect(downSet, downSet + offset, 50, 50)

        this.sketch.text('release to change colour', downSet, 2 * downSet)
        this.sketch.fill(this.colorValueReleased)
        this.sketch.rect(downSet, 2 * downSet + offset, 50, 50)

        this.sketch.text('press key to change colour', downSet, 3 * downSet)
        this.sketch.fill(this.colorValueKeyPressed)
        this.sketch.rect(downSet, 3 * downSet + offset, 50, 50)
    }

    mouseReleased() {
        if (this.colorValueReleased === 0) {
            this.colorValueReleased = 255
        } else {
            this.colorValueReleased = 0
        }
    }
    mousePressed() {
        if (this.colorValuePressed === 0) {
            this.colorValuePressed = 255
        } else {
            this.colorValuePressed = 0
        }
    }

    keyPressed() {
        if (this.colorValueKeyPressed === 0) {
            this.colorValueKeyPressed = 255
        } else {
            this.colorValueKeyPressed = 0
        }
    }
}

export const exportModule = new VisualizerExportModule(
    'Mouse Tester',
    MouseTesterVisualizer,
    'Check if p5 mouse control works.'
)
