# UI Polish & Animation Design Notes

## Color Palette Inspiration (from Coolors)

### "Peachy Delight" - Perfect for care app warmth
- #D8E2DC - Sage mist (backgrounds)
- #FFE5D9 - Peach cream (card backgrounds)
- #FFCAD4 - Soft pink (accent)
- #F4ACB7 - Rose (secondary accent)
- #9D8189 - Muted mauve (text)

### "Muted Earthy Tones" - Warm and comforting
- #FFCDB2 - Apricot (warm backgrounds)
- #FFB4A2 - Salmon (accent)
- #E5989B - Dusty rose (buttons)
- #B5838D - Mauve (secondary)
- #6D6875 - Slate (text)

### Current App Colors (to refine)
- Primary: #FF6B6B (coral red)
- Background: #FFF8F0 (warm cream)
- Green accent: #22C55E
- Text: #11181C

### Refined Color System for Polish
- Background: #FFF9F5 (warmer cream)
- Card: #FFFFFF with subtle shadow
- Primary: #FF6B6B → keep (recognizable)
- Secondary: #81B29A (muted teal - calming)
- Accent warm: #F2CC8F (apricot cream)
- Accent pink: #FFCAD4 (soft pink)
- Text primary: #1A1A2E (deep navy-black)
- Text secondary: #6B7280 (slate)
- Success: #4ADE80 (green)
- AI green: #E8F5E9 → #ECF5EC

## Animation Plan

### React Native Animated API (built-in, no extra deps)
1. **Fade-in on mount**: Cards fade in with slight upward slide
2. **Scale bounce on press**: Buttons scale down then up on press
3. **Staggered list animation**: List items appear one by one
4. **Pulse animation**: For important indicators (like check-in reminder)
5. **Confetti/celebration**: After completing check-in or diary

### Specific Page Animations
1. **Home Screen**:
   - Greeting text typing effect
   - Cards stagger in from bottom
   - Quick action grid bounces in
   - Floating emoji decoration

2. **Check-in Page**:
   - Mood emoji bounces when selected
   - Progress bar animates smoothly
   - Success celebration with emoji burst
   - Smooth step transitions

3. **Diary Page**:
   - Writing mode slides up elegantly
   - Tags bounce when selected
   - AI reply types in with cursor effect
   - History cards stagger in

4. **Medication Page**:
   - Pill emoji bounces
   - Check animation on mark taken
   - Time remaining countdown animation

## Micro-interactions
- Haptic feedback on all taps (already have)
- Scale animation on button press (0.95 → 1.0)
- Card press effect (slight shadow change)
- Success checkmark animation
- Loading shimmer effect
