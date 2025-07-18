import { LinearGradient } from 'expo-linear-gradient';
import mqtt, { MqttClient } from 'mqtt';
import React, { useEffect, useState } from 'react';
import {
    Dimensions,
    Platform,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, Pattern, Rect, Stop, LinearGradient as SvgLinearGradient } from 'react-native-svg';

const { width } = Dimensions.get('window');
const AnimatedPath = Animated.createAnimatedComponent(Path);

// --- MQTT Configuration ---
const BROKER_URL = "wss://33a3ef54aaa447b88ce44eb6e4a366ac.s1.eu.hivemq.cloud:8884/mqtt";
const BROKER_USERNAME = "hivemq.webclient.1751300302417";
const BROKER_PASSWORD = "P<,pS?OoY&djBc682A0w";
const SENSOR_TOPIC_WATER = 'esp32/distance';
const SENSOR_TOPIC_AIR_TEMP = 'esp32/air_temperature';
const SENSOR_TOPIC_AIR_HUMIDITY = 'esp32/air_humidity';
const SENSOR_TOPIC_WATER_TEMP = 'esp32/water_temperature';
const SENSOR_TOPIC_PUMP_STATUS = 'esp32/pump_status';
const CLIENT_ID = `react-native-monitor-${Math.random().toString(16).substr(2, 8)}`;


/**
 * A custom, true semi-circle progress bar component built with react-native-svg.
 * This version applies the gradient to the background track and includes a safeguard for the colors prop.
 */
const SemiCircleProgress = ({ progress, size = 120, strokeWidth = 12, colors, children }) => {
    // FIX: Add a safeguard to ensure `colors` is always a valid array to prevent crash.
    const safeColors = Array.isArray(colors) && colors.length > 0 ? colors : ['#FFFFFF', '#000000'];
    
    const radius = (size - strokeWidth) / 2;
    const center = size / 2;

    const describeArc = (x, y, radius, startAngle, endAngle) => {
        const start = { x: x + radius * Math.cos(startAngle), y: y + radius * Math.sin(startAngle) };
        const end = { x: x + radius * Math.cos(endAngle), y: y + radius * Math.sin(endAngle) };
        const largeArcFlag = endAngle - startAngle <= Math.PI ? "0" : "1";
        const d = ["M", start.x, start.y, "A", radius, radius, 0, largeArcFlag, 1, end.x, end.y].join(" ");
        return d;
    }

    const startAngleRad = Math.PI;
    const endAngleRad = 2 * Math.PI;
    const progressAngleRad = startAngleRad + (progress / 100) * (endAngleRad - startAngleRad);
    const backgroundPath = describeArc(center, center, radius, startAngleRad, endAngleRad);
    const thumbX = center + radius * Math.cos(progressAngleRad);
    const thumbY = center + radius * Math.sin(progressAngleRad);

    return (
        <View style={{ width: size, height: size / 2 + strokeWidth, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Defs>
                    <SvgLinearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                        {safeColors.map((color, index) => (
                            <Stop key={index} offset={`${(safeColors.length > 1 ? index / (safeColors.length - 1) : 0) * 100}%`} stopColor={color} />
                        ))}
                    </SvgLinearGradient>
                </Defs>
                <Path d={backgroundPath} fill="none" stroke="url(#grad)" strokeWidth={strokeWidth} strokeLinecap="round" />
                {progress > 0 && (
                    <Circle cx={thumbX} cy={thumbY} r={strokeWidth / 1.5} fill="#FFFFFF" stroke="rgba(0,0,0,0.2)" strokeWidth={1} />
                )}
            </Svg>
            <View style={styles.centerValueContainer}>{children}</View>
        </View>
    );
};

/**
 * A subtle background pattern of leaves.
 */
const BackgroundPattern = () => (
    <View style={StyleSheet.absoluteFill}>
        <Svg height="100%" width="100%" style={{ opacity: 0.05 }}>
            <Defs>
                <Pattern id="leaf" patternUnits="userSpaceOnUse" width="100" height="100">
                    <Path
                        d="M50,5 C55,15 60,25 50,50 C40,25 45,15 50,5 M50,50 C60,60 70,70 50,95 C30,70 40,60 50,50"
                        fill="none"
                        stroke="#FFFFFF"
                        strokeWidth="2"
                    />
                </Pattern>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#leaf)" />
        </Svg>
    </View>
);

export default function PlantMonitorScreen() {
    const [connectionStatus, setConnectionStatus] = useState('Disconnected');
    const [airTemp, setAirTemp] = useState(0);
    const [airHumidity, setAirHumidity] = useState(0);
    const [waterTemp, setWaterTemp] = useState(0);
    const [pumpStatus, setPumpStatus] = useState('OFF');
    const [waterLevel, setWaterLevel] = useState(0);

    useEffect(() => {
        let client: MqttClient | null = null;
        try {
            setConnectionStatus('Connecting...');
            const options = { clientId: CLIENT_ID, username: BROKER_USERNAME, password: BROKER_PASSWORD };
            client = mqtt.connect(BROKER_URL, options);

            client.on('connect', () => {
                setConnectionStatus('Connected');
                const topics = [SENSOR_TOPIC_WATER, SENSOR_TOPIC_AIR_TEMP, SENSOR_TOPIC_AIR_HUMIDITY, SENSOR_TOPIC_WATER_TEMP, SENSOR_TOPIC_PUMP_STATUS];
                topics.forEach(topic => client?.subscribe(topic, (err) => err && console.error(`Subscription error:`, err)));
            });
            client.on('error', (err) => {
                console.error('Connection error:', err);
                setConnectionStatus(`Error`);
                client?.end();
            });
            client.on('close', () => setConnectionStatus('Disconnected'));
            client.on('offline', () => setConnectionStatus('Offline'));

            client.on('message', (receivedTopic, message) => {
                const value = message.toString();
                switch (receivedTopic) {
                    case SENSOR_TOPIC_WATER:
                        const tankHeight = 30;
                        const waterLevelPercent = Math.max(0, Math.min(100, ((tankHeight - parseFloat(value)) / tankHeight) * 100));
                        setWaterLevel(waterLevelPercent);
                        break;
                    case SENSOR_TOPIC_AIR_TEMP: setAirTemp(parseFloat(value)); break;
                    case SENSOR_TOPIC_AIR_HUMIDITY: setAirHumidity(parseFloat(value)); break;
                    case SENSOR_TOPIC_WATER_TEMP: setWaterTemp(parseFloat(value)); break;
                    case SENSOR_TOPIC_PUMP_STATUS: setPumpStatus(value.toUpperCase()); break;
                }
            });
        } catch (error) {
            console.error("MQTT Connection Failed:", error);
            setConnectionStatus('Failed');
        }
        return () => client?.end();
    }, []);

    return (
        <LinearGradient colors={['#A8E063', '#56AB2F']} style={styles.container}>
            <BackgroundPattern />
            <SafeAreaView style={styles.safeArea}>
                <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
                <View style={styles.header}>
                    <Text style={styles.headerText}>Monitor Hidroponik</Text>
                    <Text style={[styles.status, { color: connectionStatus === 'Connected' ? '#FFFFFF' : '#FFCDD2' }]}>
                        {connectionStatus}
                    </Text>
                </View>
                <View style={styles.cardsContainer}>
                    <View style={styles.row}>
                        <WaterLevelCard waterLevel={waterLevel} />
                        <TemperatureCard title="Temperatur Air" temperature={airTemp} />
                    </View>
                    <View style={styles.row}>
                        <HumidityCard humidity={airHumidity} />
                        <TemperatureCard title="Temperatur Udara" temperature={waterTemp} />
                    </View>
                    <View style={styles.centeredRow}>
                        <PumpStatusCard status={pumpStatus} />
                    </View>
                </View>
            </SafeAreaView>
        </LinearGradient>
    );
}

// --- Prop Interfaces ---
interface WaterLevelCardProps { waterLevel: number; }
interface TemperatureCardProps { title: string; temperature: number; }
interface HumidityCardProps { humidity: number; }
interface PumpStatusCardProps { status: string; }

// --- Card Components ---

const WaterLevelCard = ({ waterLevel }: WaterLevelCardProps) => {
    const cardHeight = 180;
    const cardWidth = (width - 48) / 2;
    const waveHeight = useSharedValue(cardHeight);
    const waveAnimation = useSharedValue(0);

    useEffect(() => {
        // Animate water level height
        const targetHeight = cardHeight * (1 - waterLevel / 100);
        waveHeight.value = withTiming(targetHeight, { duration: 1000, easing: Easing.out(Easing.quad) });
    }, [waterLevel, cardHeight, waveHeight]);

    useEffect(() => {
        // Animate wave movement
        waveAnimation.value = withRepeat(
            withTiming(cardWidth, { duration: 4000, easing: Easing.linear }),
            -1,
            false
        );
    }, [waveAnimation, cardWidth]);

    const animatedWaveProps = useAnimatedProps(() => {
        const wavePath = `
            M ${-cardWidth + waveAnimation.value} ${waveHeight.value} 
            C ${-cardWidth * 3 / 4 + waveAnimation.value} ${waveHeight.value - 20}, ${-cardWidth / 4 + waveAnimation.value} ${waveHeight.value + 20}, ${waveAnimation.value} ${waveHeight.value}
            S ${cardWidth / 4 + waveAnimation.value} ${waveHeight.value - 20}, ${cardWidth / 2 + waveAnimation.value} ${waveHeight.value}
            S ${cardWidth * 3 / 4 + waveAnimation.value} ${waveHeight.value + 20}, ${cardWidth + waveAnimation.value} ${waveHeight.value}
            V ${cardHeight} H ${-cardWidth} Z
        `;
        return { d: wavePath };
    });

    return (
        <View style={[styles.card, {            padding: 0, 
            overflow: 'hidden',
            borderWidth: 0,  
            elevation: 0,}]}>
            <View style={[StyleSheet.absoluteFill, styles.cardTitleContainer]}>
                <Text style={styles.cardTitle}>Level Air</Text>
                <Text style={styles.progressValue}>{waterLevel.toFixed(1)}%</Text>
            </View>
            <Svg width="100%" height="100%">
                <Defs>
                    <SvgLinearGradient id="waterGradient" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor="#89f7fe" stopOpacity="0.8" />
                        <Stop offset="1" stopColor="#66a6ff" stopOpacity="0.8" />
                    </SvgLinearGradient>
                </Defs>
                <AnimatedPath
                    fill="url(#waterGradient)"
                    animatedProps={animatedWaveProps}
                />
            </Svg>
        </View>
    );
};

const TemperatureCard = ({ title, temperature }: TemperatureCardProps) => {
    const maxTemp = 50;
    const progress = Math.min(100, Math.max(0, (temperature / maxTemp) * 100));
    return (
        <View style={styles.card}>
            <Text style={styles.cardTitle}>{title}</Text>
            <SemiCircleProgress progress={progress} colors={['#4CAF50', '#FFC107', '#F44336', '#9C27B0']}>
                <Text style={styles.progressValue}>{temperature.toFixed(1)}°C</Text>
            </SemiCircleProgress>
        </View>
    );
};

const HumidityCard = ({ humidity }: HumidityCardProps) => (
    <View style={styles.card}>
        <Text style={styles.cardTitle}>Kelembapan Udara</Text>
        <SemiCircleProgress progress={humidity} colors={['#29B6F6', '#81D4FA']}>
            <Text style={styles.progressValue}>{humidity.toFixed(1)}%</Text>
        </SemiCircleProgress>
    </View>
);

const PumpStatusCard = ({ status }: PumpStatusCardProps) => (
    <View style={[styles.card, { width: (width - 48) / 2 }]}>
        <Text style={styles.cardTitle}>Pump Status</Text>
        <View style={styles.valueContainer}>
            <Text style={styles.mainValue}>{status}</Text>
            <View style={[styles.statusIndicator, { backgroundColor: status === 'ON' ? '#4CAF50' : '#F44336' }]} />
        </View>
    </View>
);

// --- Stylesheet ---
const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 0 },
    header: { paddingVertical: 30, alignItems: 'center' },
    headerText: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF' },
    status: { fontSize: 16, fontWeight: '600', marginTop: 4 },
    cardsContainer: { flex: 1, paddingHorizontal: 16 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    centeredRow: { alignItems: 'center', marginBottom: 16 },
    card: {
width: (width - 48) / 2,
        height: 180,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        borderRadius: 20,
        padding: 16,
        alignItems: 'center',
        justifyContent: 'space-between',
        // iOS shadow
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,  // Reduced opacity
        shadowRadius: 4,
        // Android elevation - reduced
        //elevation: 3,
        
        //borderWidth: 1,
        //borderColor: 'rgba(255, 255, 255, 0.1)',
        overflow: 'hidden',
    },
    cardTitle: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
    cardTitleContainer: {
        position: 'absolute',
        top: 16,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 10,
    },
    valueContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    mainValue: { fontSize: 36, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 12 },
    statusIndicator: { width: 20, height: 20, borderRadius: 10 },
    centerValueContainer: { position: 'absolute', top: '50%', left: 0, right: 0, alignItems: 'center' },
    progressValue: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF' },
});
