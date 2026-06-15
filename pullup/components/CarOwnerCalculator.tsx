import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, Animated, Easing, KeyboardAvoidingView,
    LayoutChangeEvent, PanResponder, Platform, ScrollView, Share,
    StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalculatorInputs, CalculatorResults, CarOwnerCalculatorService } from '@/utils/carOwnerCalculatorService';

import { WARM_CORE } from '@/constants/theme';

const A = WARM_CORE.primary; // '#D4500A' - Burnt Orange
const G = WARM_CORE.success; // '#10B981' - Success Green
const R = WARM_CORE.error;   // '#EF4444' - Error Red
const BG = WARM_CORE.background; // '#FFF8F0' - Cream background
const CARD = WARM_CORE.card;     // '#F4E9D9' - Sand card
const CARD2 = WARM_CORE.white;   // '#FFFFFF' - White secondary
const B = WARM_CORE.border;      // '#E8DCCB' - Sand-Cream border
const M = WARM_CORE.textSecondary; // '#6E5650' - Warm brown labels
const S = WARM_CORE.text;          // '#1E120D' - Dark brown body text
const W = WARM_CORE.white;         // '#FFFFFF'
const TRACK_BG = '#E8DCCB';       // Border color for track background

// Count-up animation hook
function useCountUp(target: number, duration = 800, active = true) {
    const anim = useRef(new Animated.Value(0)).current;
    const [val, setVal] = useState(0);
    useEffect(() => {
        if (!active) return;
        anim.setValue(0);
        const listener = anim.addListener(({ value }) => setVal(Math.round(value)));
        Animated.timing(anim, { toValue: target, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
        return () => anim.removeListener(listener);
    }, [target, active]);
    return active ? val : target;
}

// Fade-in wrapper
function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
    const op = useRef(new Animated.Value(0)).current;
    const ty = useRef(new Animated.Value(14)).current;
    useEffect(() => {
        Animated.parallel([
            Animated.timing(op, { toValue: 1, duration: 420, delay, useNativeDriver: true }),
            Animated.timing(ty, { toValue: 0, duration: 360, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]).start();
    }, []);
    return <Animated.View style={{ opacity: op, transform: [{ translateY: ty }] }}>{children}</Animated.View>;
}

// Animated press button
function PressBtn({ style, onPress, children, disabled }: any) {
    const scale = useRef(new Animated.Value(1)).current;
    const press = () => Animated.sequence([
        Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    return (
        <TouchableOpacity onPress={() => { press(); onPress?.(); }} disabled={disabled} activeOpacity={1}>
            <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
        </TouchableOpacity>
    );
}

// Text field with optional clear
function Field({ label, value, onChange, placeholder, unit, onClear, kb = 'decimal-pad' }: {
    label: string; value: string; onChange: (t: string) => void;
    placeholder?: string; unit?: string; onClear?: () => void; kb?: any;
}) {
    const focused = useRef(new Animated.Value(0)).current;
    const bc = focused.interpolate({ inputRange: [0, 1], outputRange: [B, A] });
    return (
        <Animated.View style={[st.field, { borderColor: bc }]}>
            <View style={st.fieldTop}>
                <Text style={st.flbl}>{label}</Text>
                {unit && <Text style={st.funit}>{unit}</Text>}
            </View>
            <View style={st.frow}>
                <TextInput style={st.finput} value={value} onChangeText={onChange}
                    placeholder={placeholder ?? '0'} placeholderTextColor="#333"
                    keyboardType={kb} selectionColor={A}
                    onFocus={() => Animated.timing(focused, { toValue: 1, duration: 200, useNativeDriver: false }).start()}
                    onBlur={() => Animated.timing(focused, { toValue: 0, duration: 200, useNativeDriver: false }).start()} />
                {onClear && value.length > 0 && (
                    <TouchableOpacity onPress={onClear} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                        <View style={st.clearBtn}>
                            <MaterialCommunityIcons name="close" size={12} color={M} />
                        </View>
                    </TouchableOpacity>
                )}
            </View>
        </Animated.View>
    );
}

// Custom Slider with animated pill, precise track fill, and smooth thumb
function SliderField({ label, value, min, max, step, unit, onChange }: {
    label: string; value: number; min: number; max: number;
    step: number; unit: string; onChange: (v: number) => void;
}) {
    const trackWidth = useRef(0);
    const pillScale = useRef(new Animated.Value(1)).current;
    const thumbScale = useRef(new Animated.Value(1)).current;
    const isDragging = useRef(false);

    const pct = (value - min) / (max - min);

    const snapValue = (raw: number) => {
        const clamped = Math.max(min, Math.min(max, raw));
        if (step <= 0) return clamped;
        return Math.round((clamped - min) / step) * step + min;
    };

    const valueFromX = (x: number): number => {
        const w = trackWidth.current;
        if (w <= 0) return value;
        const ratio = Math.max(0, Math.min(1, x / w));
        return snapValue(min + ratio * (max - min));
    };

    const onDragStart = () => {
        isDragging.current = true;
        Animated.parallel([
            Animated.spring(thumbScale, { toValue: 1.25, useNativeDriver: true, speed: 30, bounciness: 8 }),
            Animated.spring(pillScale, { toValue: 1.08, useNativeDriver: true, speed: 30, bounciness: 6 }),
        ]).start();
    };

    const onDragEnd = () => {
        isDragging.current = false;
        Animated.parallel([
            Animated.spring(thumbScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }),
            Animated.spring(pillScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }),
        ]).start();
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (e) => {
                onDragStart();
                onChange(valueFromX(e.nativeEvent.locationX));
            },
            onPanResponderMove: (e) => {
                onChange(valueFromX(e.nativeEvent.locationX));
            },
            onPanResponderRelease: () => onDragEnd(),
            onPanResponderTerminate: () => onDragEnd(),
        })
    ).current;



    const displayVal = step < 1 ? value.toFixed(1) : Math.round(value).toString();
    const thumbLeft = `${pct * 100}%` as `${number}%`;

    return (
        <View style={st.sliderWrap}>
            {/* Label row */}
            <View style={st.sliderTop}>
                <Text style={st.flbl}>{label}</Text>
                <Animated.View style={[
                    st.pill,
                    { transform: [{ scale: pillScale }] },
                ]}>
                    <Text style={st.pillVal}>{displayVal}</Text>
                    <Text style={st.pillUnit}> {unit}</Text>
                </Animated.View>
            </View>

            {/* Custom track + thumb */}
            <View
                style={st.trackHitArea}
                onLayout={(e: LayoutChangeEvent) => { trackWidth.current = e.nativeEvent.layout.width; }}
                {...panResponder.panHandlers}
            >
                {/* Track background */}
                <View style={st.trackBg}>
                    {/* Filled portion */}
                    <View style={[st.trackFill, { width: `${pct * 100}%` }]} />
                </View>

                {/* Thumb */}
                <Animated.View
                    pointerEvents="none"
                    style={[
                        st.thumb,
                        {
                            left: thumbLeft,
                            transform: [
                                { translateX: -10 },
                                { scale: thumbScale },
                            ],
                        },
                    ]}
                />
            </View>

            {/* Range labels */}
            <View style={st.sliderRange}>
                <Text style={st.rangeTxt}>{min} {unit}</Text>
                <Text style={st.rangeTxt}>{max} {unit}</Text>
            </View>
        </View>
    );
}

// Passenger selector
function Pax({ value, onChange }: { value: number; onChange: (n: number) => void }) {
    return (
        <View style={st.paxRow}>
            {[2, 3, 4, 5, 6].map(n => {
                const on = n === value;
                return (
                    <TouchableOpacity key={n} onPress={() => onChange(n)} activeOpacity={0.7}
                        style={[st.paxPill, on && st.paxOn]}>
                        <Text style={[st.paxN, on && st.paxNOn]}>{n}</Text>
                        <Text style={[st.paxSub, on && st.paxSubOn]}>pax</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const Div = () => <View style={st.div} />;

// ═══════════════════════════ MAIN ═══════════════════════════
export default function CarOwnerCalculator() {
    const router = useRouter();
    const [step, setStep] = useState<'input' | 'results'>('input');
    const [loading, setLoading] = useState(false);
    const [distance, setDistance] = useState('15');
    const [days, setDays] = useState(22);
    const [months, setMonths] = useState(12);
    const [mileage, setMileage] = useState('16.5');
    const [fuel, setFuel] = useState('100');
    const [pax, setPax] = useState(2);
    const [results, setResults] = useState<CalculatorResults | null>(null);

    const d = parseFloat(distance) || 0;
    const f = parseFloat(fuel) || 0;
    const m = parseFloat(mileage) || 1;
    const perDay = d > 0 && f > 0 && m > 0 ? Math.round((d * 2 / m) * f / pax) : null;

    const calc = useCallback(async () => {
        try {
            setLoading(true);
            if (d <= 0) throw new Error('Enter a valid distance');
            if (f <= 0) throw new Error('Enter a valid fuel price');
            if (m <= 0) throw new Error('Enter a valid mileage');
            const inp: CalculatorInputs = {
                oneWayDistance: d, daysPerMonth: Math.round(days),
                monthsPerYear: Math.round(months), carMileage: m,
                fuelPrice: f, numberOfPassengers: pax,
            };
            setResults(CarOwnerCalculatorService.calculate(inp));
            setStep('results');
        } catch (e: any) { Alert.alert('Check inputs', e.message); }
        finally { setLoading(false); }
    }, [d, days, months, m, f, pax]);

    const reset = useCallback(() => {
        setStep('input'); setResults(null);
        setDistance('15'); setDays(22); setMonths(12);
        setMileage('16.5'); setFuel('100'); setPax(2);
    }, []);

    const share = useCallback(async () => {
        if (!results) return;
        await Share.share({ message: `🚗 PullUp Carpool Savings\n\nMonthly: ₹${Math.round(results.monthlySavings).toLocaleString('en-IN')}\nYearly: ₹${Math.round(results.yearlySavings).toLocaleString('en-IN')}\n\nJoin PullUp!` });
    }, [results]);

    if (step === 'results' && results) return <Results results={results} onBack={reset} onShare={share} />;

    return (
        <SafeAreaView style={st.safe} edges={['top', 'left', 'right']}>
            <View style={st.hdr}>
                <TouchableOpacity onPress={() => router.back()} style={st.iconBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={20} color={S} />
                </TouchableOpacity>
                <View style={{ alignItems: 'center' }}>
                    <Text style={st.hTitle}>Carpool Calculator</Text>
                    <Text style={st.hSub}>Estimate your savings</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">
                    <FadeIn delay={40}>
                        <View style={st.card}>
                            <Field label="One-way distance" value={distance} onChange={setDistance}
                                placeholder="15" unit="km"
                                onClear={() => setDistance('')} />
                            <Div />
                            <SliderField label="Days per month" value={days} min={1} max={31} step={1} unit="days" onChange={setDays} />
                            <Div />
                            <SliderField label="Months per year" value={months} min={1} max={12} step={1} unit="months" onChange={setMonths} />
                            <Div />
                            <View style={st.row2}>
                                <View style={{ flex: 1 }}>
                                    <Field label="Mileage" value={mileage} onChange={(t) => { const n = parseFloat(t); if (!isNaN(n) && n > 0 && n <= 50 || t === '') setMileage(t); }}
                                        placeholder="16.5" unit="km/l"
                                        onClear={() => setMileage('')} />
                                </View>
                                <View style={st.vDiv} />
                                <View style={{ flex: 1 }}>
                                    <Field label="Fuel price" value={fuel} onChange={setFuel}
                                        placeholder="100" unit="₹/l"
                                        onClear={() => setFuel('')} />
                                </View>
                            </View>
                            <Div />
                            <View style={st.paxWrap}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <Text style={st.flbl}>Passengers</Text>
                                    <Text style={{ fontSize: 11, color: M }}>including you</Text>
                                </View>
                                <Pax value={pax} onChange={setPax} />
                            </View>
                        </View>
                    </FadeIn>

                    <FadeIn delay={100}>
                        <View style={st.bottomBlock}>
                            {perDay !== null && (
                                <View style={st.previewCard}>
                                    <View>
                                        <Text style={st.previewLbl}>Your share / day</Text>
                                        <Text style={{ fontSize: 11, color: M, marginTop: 2 }}>Round trip · {pax} passengers</Text>
                                    </View>
                                    <Text style={st.previewVal}>₹{perDay}</Text>
                                </View>
                            )}
                            <PressBtn style={[st.cta, loading && { opacity: 0.5 }]} onPress={calc} disabled={loading}>
                                {loading
                                    ? <ActivityIndicator color={W} />
                                    : <>
                                        <MaterialCommunityIcons name="lightning-bolt" size={18} color={W} style={{ marginRight: 8 }} />
                                        <Text style={st.ctaTxt}>See My Savings</Text>
                                        <MaterialCommunityIcons name="chevron-right" size={18} color={W + 'BB'} style={{ marginLeft: 6 }} />
                                    </>}
                            </PressBtn>
                        </View>
                    </FadeIn>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

// ═══════════════════════════ RESULTS ═══════════════════════════
function Results({ results, onBack, onShare }: { results: CalculatorResults; onBack: () => void; onShare: () => void }) {
    const saving = results.monthlySavings > 0;
    const sc = saving ? G : R;
    const monthly = useCountUp(Math.abs(Math.round(results.monthlySavings)));
    const yearly = useCountUp(Math.abs(Math.round(results.yearlySavings)));
    const solo = useCountUp(Math.round(results.soloDailyFuelCost));
    const pool = useCountUp(Math.round(results.totalDailyCarpoolCost));

    return (
        <SafeAreaView style={st.safe} edges={['top', 'left', 'right']}>
            <View style={st.hdr}>
                <TouchableOpacity onPress={onBack} style={st.iconBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={20} color={S} />
                </TouchableOpacity>
                <View style={{ alignItems: 'center' }}>
                    <Text style={st.hTitle}>Your Savings</Text>
                    <Text style={st.hSub}>Carpool analysis</Text>
                </View>
                <TouchableOpacity onPress={onShare} style={st.iconBtn}>
                    <MaterialCommunityIcons name="share-variant-outline" size={20} color={S} />
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll}>
                <FadeIn delay={0}>
                    <View style={[st.heroCard, { borderColor: sc + '30' }]}>
                        <View style={[st.heroTopBadge, { backgroundColor: sc + '18', borderColor: sc + '35' }]}>
                            <MaterialCommunityIcons name={saving ? 'trending-down' : 'trending-up'} size={11} color={sc} />
                            <Text style={[st.heroTopBadgeTxt, { color: sc }]}>
                                {saving ? `${results.savingsPercentage.toFixed(0)}% cheaper than solo` : 'No savings yet'}
                            </Text>
                        </View>
                        <Text style={st.heroEye}>MONTHLY SAVINGS</Text>
                        <Text style={[st.heroAmt, { color: sc }]}>
                            ₹{monthly.toLocaleString('en-IN')}
                        </Text>
                        <View style={st.heroFooter}>
                            <MaterialCommunityIcons name="calendar-month-outline" size={13} color={M} />
                            <Text style={[st.heroYearly]}>
                                <Text style={{ color: sc, fontWeight: '700' }}>₹{yearly.toLocaleString('en-IN')}</Text>
                                <Text style={{ color: M, fontWeight: '500' }}> / year</Text>
                            </Text>
                        </View>
                    </View>
                </FadeIn>

                <FadeIn delay={80}>
                    <View style={st.compareRow}>
                        <View style={[st.cmpCard, { borderColor: R + '35', backgroundColor: R + '08' }]}>
                            <View style={[st.cmpIconBox, { backgroundColor: R + '20', marginBottom: 10 }]}>
                                <MaterialCommunityIcons name="car" size={15} color="#F87171" />
                            </View>
                            <Text style={st.cmpEye}>SOLO / DAY</Text>
                            <Text style={[st.cmpAmt, { color: '#F87171' }]}>₹{solo}</Text>
                            <Text style={st.cmpSub}>Driving alone</Text>
                        </View>
                        <View style={st.cmpDivider}>
                            <View style={st.cmpDividerLine} />
                            <View style={st.cmpVs}><Text style={st.cmpVsTxt}>VS</Text></View>
                            <View style={st.cmpDividerLine} />
                        </View>
                        <View style={[st.cmpCard, { borderColor: G + '35', backgroundColor: G + '08' }]}>
                            <View style={[st.cmpIconBox, { backgroundColor: G + '20', marginBottom: 10 }]}>
                                <MaterialCommunityIcons name="account-group" size={15} color="#4ADE80" />
                            </View>
                            <Text style={st.cmpEye}>POOL / DAY</Text>
                            <Text style={[st.cmpAmt, { color: '#4ADE80' }]}>₹{pool}</Text>
                            <Text style={st.cmpSub}>With carpool</Text>
                        </View>
                    </View>
                </FadeIn>

                <FadeIn delay={150}>
                    <View style={st.card}>
                        <RRow label="Daily savings" val={`₹${Math.round(results.dailySavings)}`} c={sc} />
                        <Div />
                        <RRow label="Monthly savings" val={`₹${Math.round(results.monthlySavings).toLocaleString('en-IN')}`} c={sc} />
                        <Div />
                        <RRow label="Yearly savings" val={`₹${Math.round(results.yearlySavings).toLocaleString('en-IN')}`} c={sc} bold />
                    </View>
                </FadeIn>

                <FadeIn delay={210}>
                    <View style={st.card}>
                        <RRow label="Your monthly cost" val={`₹${Math.round(results.totalMonthlyCarpolCost).toLocaleString('en-IN')}`} c={A} bold />
                        <Div />
                        <RRow label="Solo would cost" val={`₹${Math.round(results.soloMonthlyFuelCost).toLocaleString('en-IN')}`} c={M} strike />
                    </View>
                </FadeIn>

                <FadeIn delay={270}>
                    <View style={st.tiles}>
                        <View style={[st.tile, { borderColor: G + '22' }]}>
                            <Text style={[st.tileVal, { color: '#4ADE80' }]}>{(results.yearlyCO2Reduction / 1000).toFixed(1)}</Text>
                            <Text style={st.tileUnit}>tons CO₂/yr</Text>
                        </View>
                        <View style={[st.tile, { borderColor: B }]}>
                            <Text style={st.tileVal}>{results.roundTripDistance}</Text>
                            <Text style={st.tileUnit}>km round trip</Text>
                        </View>
                        <View style={[st.tile, { borderColor: B }]}>
                            <Text style={st.tileVal}>{Math.round(results.monthlyDistance).toLocaleString('en-IN')}</Text>
                            <Text style={st.tileUnit}>km / month</Text>
                        </View>
                    </View>
                </FadeIn>

                <FadeIn delay={320}>
                    <View style={st.actions}>
                        <PressBtn style={st.priBtn} onPress={onShare}>
                            <MaterialCommunityIcons name="share-variant-outline" size={16} color={W} style={{ marginRight: 8 }} />
                            <Text style={st.priTxt}>Share My Savings</Text>
                        </PressBtn>
                        <PressBtn style={st.secBtn} onPress={onBack}>
                            <MaterialCommunityIcons name="refresh" size={15} color={S} style={{ marginRight: 6 }} />
                            <Text style={st.secTxt}>Recalculate</Text>
                        </PressBtn>
                    </View>
                </FadeIn>
            </ScrollView>
        </SafeAreaView>
    );
}

function RRow({ label, val, c, bold, strike }: { label: string; val: string; c: string; bold?: boolean; strike?: boolean }) {
    return (
        <View style={st.rrow}>
            <Text style={st.rlbl}>{label}</Text>
            <Text style={[st.rval, { color: c }, bold && { fontWeight: '800', fontSize: 16 } as any, strike && { textDecorationLine: 'line-through', opacity: 0.45 } as any]}>
                {val}
            </Text>
        </View>
    );
}

const st = StyleSheet.create({
    safe: { flex: 1, backgroundColor: BG },
    scroll: { padding: 16, paddingBottom: 44, gap: 10 },
    hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: B },
    hTitle: { fontSize: 15, fontWeight: '700', color: S },
    hSub: { fontSize: 11, color: M, marginTop: 1 },
    iconBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: CARD2, borderWidth: 1, borderColor: B, justifyContent: 'center', alignItems: 'center' },

    card: { backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: B, overflow: 'hidden' },
    div: { height: 1, backgroundColor: B, marginHorizontal: 16 },
    vDiv: { width: 1, backgroundColor: B, marginVertical: 12 },
    row2: { flexDirection: 'row' },

    field: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderWidth: 0 },
    fieldTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
    flbl: { fontSize: 11, fontWeight: '600', color: S, letterSpacing: 0.2 },
    funit: { fontSize: 10, color: M, fontWeight: '600' },
    frow: { flexDirection: 'row', alignItems: 'center' },
    finput: { flex: 1, fontSize: 24, fontWeight: '700', color: S, paddingVertical: 0, letterSpacing: -0.5 },
    clearBtn: { width: 22, height: 22, borderRadius: 11, backgroundColor: B, borderWidth: 1, borderColor: B, justifyContent: 'center', alignItems: 'center' },

    sliderWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14 },
    sliderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    // Custom track layout
    trackHitArea: { height: 36, justifyContent: 'center', marginHorizontal: 2, position: 'relative' },
    trackBg: { height: 4, backgroundColor: TRACK_BG, borderRadius: 4, overflow: 'visible' },
    trackFill: { height: 4, backgroundColor: A, borderRadius: 4 },
    thumb: {
        position: 'absolute',
        top: '50%',
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: A,
        marginTop: -8,
    },
    pill: {
        flexDirection: 'row', alignItems: 'baseline',
        backgroundColor: A + '18', borderRadius: 20,
        paddingHorizontal: 11, paddingVertical: 5,
        borderWidth: 1, borderColor: A + '45',
    },
    pillVal: { fontSize: 13, fontWeight: '800', color: A, letterSpacing: -0.3 },
    pillUnit: { fontSize: 10, color: A + 'AA', fontWeight: '600', marginLeft: 2 },
    sliderRange: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginHorizontal: 2 },
    rangeTxt: { fontSize: 10, color: M, fontWeight: '500', letterSpacing: 0.1 },

    paxWrap: { padding: 16 },
    paxRow: { flexDirection: 'row', gap: 8 },
    paxPill: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: CARD2, borderWidth: 1, borderColor: B, alignItems: 'center' },
    paxOn: { backgroundColor: A + '15', borderColor: A },
    paxN: { fontSize: 16, fontWeight: '700', color: S },
    paxNOn: { color: A },
    paxSub: { fontSize: 9, color: M, marginTop: 2 },
    paxSubOn: { color: A + '90' },

    bottomBlock: { gap: 10 },
    previewCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: A + '35', paddingHorizontal: 18, paddingVertical: 16 },
    previewLbl: { fontSize: 13, fontWeight: '600', color: S },
    previewVal: { fontSize: 28, fontWeight: '800', color: A, letterSpacing: -1 },

    cta: { backgroundColor: A, borderRadius: 16, paddingVertical: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', shadowColor: A, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
    ctaTxt: { fontSize: 16, fontWeight: '800', color: W, letterSpacing: 0.3 },

    heroCard: { backgroundColor: CARD, borderRadius: 22, borderWidth: 1, padding: 24, alignItems: 'center', gap: 4 },
    heroTopBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, marginBottom: 14 },
    heroTopBadgeTxt: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
    heroEye: { fontSize: 10, fontWeight: '700', color: M, letterSpacing: 2.5, marginBottom: 2 },
    heroAmt: { fontSize: 56, fontWeight: '800', letterSpacing: -3, marginBottom: 10 },
    heroFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    heroYearly: { fontSize: 15, letterSpacing: -0.3 },

    compareRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
    cmpCard: { flex: 1, backgroundColor: CARD, borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'center' },
    cmpIconBox: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    cmpDivider: { width: 24, alignItems: 'center', justifyContent: 'center', gap: 6 },
    cmpDividerLine: { flex: 1, width: 1, backgroundColor: B },
    cmpVs: { width: 22, height: 22, borderRadius: 11, backgroundColor: B, borderWidth: 1, borderColor: B, alignItems: 'center', justifyContent: 'center' },
    cmpVsTxt: { fontSize: 7, fontWeight: '800', color: M, letterSpacing: 0.5 },
    cmpEye: { fontSize: 9, fontWeight: '700', color: M, letterSpacing: 1.6, marginBottom: 4, marginTop: 2 },
    cmpAmt: { fontSize: 30, fontWeight: '800', letterSpacing: -1.2 },
    cmpSub: { fontSize: 10, color: M, marginTop: 3, fontWeight: '500' },

    rrow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15 },
    rlbl: { fontSize: 13, color: S },
    rval: { fontSize: 15, fontWeight: '700' },

    tiles: { flexDirection: 'row', gap: 8 },
    tile: { flex: 1, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center' },
    tileVal: { fontSize: 18, fontWeight: '800', color: S, letterSpacing: -0.5 },
    tileUnit: { fontSize: 9, fontWeight: '600', color: M, marginTop: 4, textAlign: 'center' },

    actions: { flexDirection: 'column', gap: 8 },
    secBtn: { paddingVertical: 15, borderRadius: 14, alignItems: 'center', backgroundColor: CARD2, borderWidth: 1, borderColor: B, flexDirection: 'row', justifyContent: 'center' },
    secTxt: { fontSize: 14, fontWeight: '600', color: S },
    priBtn: { paddingVertical: 17, borderRadius: 14, alignItems: 'center', backgroundColor: A, flexDirection: 'row', justifyContent: 'center', shadowColor: A, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
    priTxt: { fontSize: 15, fontWeight: '800', color: W },
});
