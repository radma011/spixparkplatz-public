import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {getColors} from '../../theme/colors';
import FacilityLayoutService from '../FacilityLayoutService';
import FirestoreService from '../../services/FirestoreService';
import LayoutSurface, {type LayoutSurfaceHandle} from './LayoutSurface';
import {SPOT_HIGHLIGHT_GREEN} from './FacilityLayoutMapModal';
import {MAX_LAYOUT_ZOOM, MIN_LAYOUT_ZOOM} from '../gridMath';
import type {FacilityLayout} from '../types';

type Props = {
  facilityCode: string;
  highlightSpotIds?: string[];
  highlightColor?: string;
  /** Slightly fade everything except highlighted spots (spot map from offer card). */
  dimNonHighlighted?: boolean;
  onClose: () => void;
};

const FacilityLayoutViewer: React.FC<Props> = ({
  facilityCode,
  highlightSpotIds = [],
  highlightColor = SPOT_HIGHLIGHT_GREEN,
  dimNonHighlighted = false,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const colors = getColors(useColorScheme());
  const [layout, setLayout] = useState<FacilityLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [assignedSpotNumbers, setAssignedSpotNumbers] = useState<Set<string> | null>(null);
  const surfaceRef = useRef<LayoutSurfaceHandle>(null);

  const highlights = useMemo(
    () => new Set(highlightSpotIds.map((s) => s.trim()).filter(Boolean)),
    [highlightSpotIds],
  );

  useEffect(() => {
    let cancelled = false;
    setAssignedSpotNumbers(null);
    (async () => {
      setLoading(true);
      const [doc, spotIds] = await Promise.all([
        FacilityLayoutService.loadForViewer(facilityCode),
        FirestoreService.getFacilityAssignedSpots(facilityCode),
      ]);
      if (!cancelled) {
        setLayout(doc);
        setAssignedSpotNumbers(
          spotIds != null ? new Set(spotIds.map((s) => s.trim().toUpperCase())) : null,
        );
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [facilityCode]);

  if (loading) {
    return (
      <View style={[styles.centered, {backgroundColor: colors.screenBg, paddingTop: insets.top}]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!layout || layout.elements.length === 0) {
    return (
      <View style={[styles.root, {backgroundColor: colors.screenBg, paddingTop: insets.top}]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons name="close" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, {color: colors.text}]}>Lageplan</Text>
          <View style={{width: 26}} />
        </View>
        <View style={styles.centered}>
          <Text style={{color: colors.subtext, textAlign: 'center', padding: 24}}>
            Für diese Anlage ist noch kein Lageplan hinterlegt.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, {backgroundColor: colors.screenBg, paddingTop: insets.top}]}>
      <View style={[styles.header, {borderBottomColor: colors.border}]}>
        <TouchableOpacity onPress={onClose}>
          <MaterialCommunityIcons name="close" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, {color: colors.text}]}>Lageplan · {layout.facilityCode}</Text>
        <TouchableOpacity onPress={() => surfaceRef.current?.fitToContent()} accessibilityLabel="Auf Inhalt fokussieren">
          <MaterialCommunityIcons name="fit-to-screen-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>
      <LayoutSurface
        ref={surfaceRef}
        layout={layout}
        autoFitOnLayout
        readOnly
        zoom={zoom}
        onZoomChange={setZoom}
        highlightNumbers={highlights}
        highlightColor={highlightColor}
        dimNonHighlighted={dimNonHighlighted}
        assignedSpotNumbers={assignedSpotNumbers}
      />
      <View style={[styles.zoomBar, {paddingBottom: insets.bottom + 8, borderTopColor: colors.border}]}>
        <TouchableOpacity onPress={() => surfaceRef.current?.fitToContent()}>
          <MaterialCommunityIcons name="fit-to-screen-outline" size={22} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setZoom((z) => Math.max(MIN_LAYOUT_ZOOM, z - 0.2))}>
          <MaterialCommunityIcons name="minus" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={{color: colors.subtext}}>{Math.round(zoom * 100)}%</Text>
        <TouchableOpacity onPress={() => setZoom((z) => Math.min(MAX_LAYOUT_ZOOM, z + 0.2))}>
          <MaterialCommunityIcons name="plus" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1},
  centered: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {fontSize: 17, fontWeight: '700', flex: 1, marginHorizontal: 8},
  zoomBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    paddingTop: 10,
    borderTopWidth: 1,
  },
});

export default FacilityLayoutViewer;
