import React, { useEffect, useRef, useState } from 'react';

declare const window: any;

interface LocationItem {
  MovieTitle: string;
  LocationName: string;
  Coordinates: string;
  SceneImageUrl: string;
  Description: string;
  YoutubeUrl: string;
  PosterUrl?: string;
  lat: number;
  lng: number;
}

interface UserRecord {
  isLiked: boolean;
  visitHistory?: string[];
}

export default function App() {
  const mapRef = useRef<HTMLDivElement>(null);
  const adRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [allData, setAllData] = useState<LocationItem[]>([]);
  const [markers, setMarkers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMovie, setSelectedMovie] = useState<string>('');
  const [myLocationMarker, setMyLocationMarker] = useState<any>(null);
  const [activePopupItem, setActivePopupItem] = useState<LocationItem | null>(null);

  // 마이페이지 / 서랍 모달 상태
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'liked' | 'visited'>('liked');

  const [userRecords, setUserRecords] = useState<{ [key: string]: UserRecord }>(() => {
    try {
      const saved = localStorage.getItem('movie_map_user_records_v3');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQEKtaZqTTM8UOBscio1E6ubJIzoFrte9oWOUtS69SpDBAjT4NuQIYwFKI6tRTr9Kd7nu3i9fHrdlb6/pub?output=csv';

  useEffect(() => {
    try {
      localStorage.setItem('movie_map_user_records_v3', JSON.stringify(userRecords));
    } catch (e) {
      console.error('저장 실패:', e);
    }
  }, [userRecords]);

  // 카카오 애드핏 스크립트 동적 로드
  useEffect(() => {
    if (!adRef.current) return;
    if (adRef.current.querySelector('ins')) return;

    const ins = document.createElement('ins');
    ins.className = 'kakao_ad_area';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-unit', 'DAN-mhLeRLPzRhfWLipn');
    ins.setAttribute('data-ad-width', '320');
    ins.setAttribute('data-ad-height', '50');

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = '//t1.kakaocdn.net/kas/static/ba.min.js';
    script.async = true;

    adRef.current.appendChild(ins);
    adRef.current.appendChild(script);
  }, []);

  const parseCSVLine = (textLine: string) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < textLine.length; i++) {
      const char = textLine[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result;
  };

  const parseCSV = (text: string): LocationItem[] => {
    const lines = text.split('\n');
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]);
    const result: LocationItem[] = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const currentLine = parseCSVLine(lines[i]);
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header] = currentLine[index] ? currentLine[index] : '';
      });

      const coordRaw = obj.Coordinates || '';
      if (coordRaw.includes(',')) {
        const parts = coordRaw.split(',');
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
          obj.lat = lat;
          obj.lng = lng;
          result.push(obj);
        }
      }
    }
    return result;
  };

  useEffect(() => {
    if (!mapRef.current || !window.google) return;

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 36.5, lng: 127.5 },
      zoom: 7,
      disableDefaultUI: true,
    });

    setMapInstance(map); // 👈 이 코드를 추가하여 지도 인스턴스를 저장해 줍니다!

    fetch(SHEET_CSV_URL)
      .then((res) => res.text())
      .then((csvText) => {
        const parsedData = parseCSV(csvText);
        setAllData(parsedData);
      })
      .catch((err) => {
        console.error('데이터 로드 실패:', err);
      });
  }, []);

  const toggleLike = (key: string) => {
    setUserRecords((prev) => {
      const current = prev[key] || { isLiked: false, visitHistory: [] };
      return {
        ...prev,
        [key]: { ...current, isLiked: !current.isLiked },
      };
    });
  };

  const addVisit = (key: string) => {
    const now = new Date();
    const timeString = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    setUserRecords((prev) => {
      const current = prev[key] || { isLiked: false, visitHistory: [] };
      const history = current.visitHistory ? [...current.visitHistory, timeString] : [timeString];
      return {
        ...prev,
        [key]: { ...current, visitHistory: history },
      };
    });
  };

  const removeVisit = (key: string, indexToRemove: number) => {
    setUserRecords((prev) => {
      const current = prev[key];
      if (!current || !current.visitHistory) return prev;
      const history = current.visitHistory.filter((_, idx) => idx !== indexToRemove);
      return {
        ...prev,
        [key]: { ...current, visitHistory: history },
      };
    });
  };

  useEffect(() => {
    if (!mapInstance || allData.length === 0) return;

    markers.forEach((m) => m.setMap(null));
    const newMarkers: any[] = [];
    let firstMatchPosition = null;

    const query = searchTerm.toLowerCase();

    allData.forEach((item) => {
      const matchesSearch =
        item.MovieTitle.toLowerCase().includes(query) ||
        item.LocationName.toLowerCase().includes(query);

      const matchesSelectedMovie = selectedMovie ? item.MovieTitle === selectedMovie : true;

      if (searchTerm && !matchesSearch) return;
      if (selectedMovie && !matchesSelectedMovie) return;

      const position = { lat: item.lat, lng: item.lng };

      if (!firstMatchPosition) {
        firstMatchPosition = position;
      }

      const marker = new window.google.maps.Marker({
        position,
        map: mapInstance,
        title: item.LocationName,
      });

      marker.addListener('click', () => {
        setActivePopupItem(item);
        mapInstance.panTo(position);
      });

      newMarkers.push(marker);
    });

    setMarkers(newMarkers);

    if ((searchTerm || selectedMovie) && firstMatchPosition) {
      mapInstance.setCenter(firstMatchPosition);
      mapInstance.setZoom(12);
    } else if (!searchTerm && !selectedMovie && allData.length > 0) {
      mapInstance.setCenter({ lat: allData[0].lat, lng: allData[0].lng });
      mapInstance.setZoom(7);
    }
  }, [searchTerm, selectedMovie, allData, mapInstance]);

  const handlePanToCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('이 브라우저는 위치 정보를 지원하지 않습니다.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const pos = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        mapInstance.setCenter(pos);
        mapInstance.setZoom(14);

        if (myLocationMarker) {
          myLocationMarker.setMap(null);
        }

        const marker = new window.google.maps.Marker({
          position: pos,
          map: mapInstance,
          title: '내 위치',
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#4285F4',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });

        setMyLocationMarker(marker);
      },
      () => {
        alert('위치 정보를 가져오는 데 실패했습니다. 위치 권한을 확인해주세요.');
      }
    );
  };

  const handleSelectLocationFromDrawer = (item: LocationItem) => {
    setIsDrawerOpen(false);
    setActivePopupItem(item);
    if (mapInstance) {
      mapInstance.setCenter({ lat: item.lat, lng: item.lng });
      mapInstance.setZoom(14);
    }
  };

  const movieMap = new Map();
  allData.forEach((item) => {
    if (!movieMap.has(item.MovieTitle)) {
      movieMap.set(item.MovieTitle, item);
    }
  });
  const uniqueMovies = Array.from(movieMap.values());

  const activeRecordKey = activePopupItem ? `${activePopupItem.MovieTitle}_${activePopupItem.LocationName}` : '';
  const activeRecord = userRecords[activeRecordKey] || { isLiked: false, visitHistory: [] };

  const likedItems = allData.filter((item) => {
    const key = `${item.MovieTitle}_${item.LocationName}`;
    return userRecords[key]?.isLiked;
  });

  const visitedItems = allData.filter((item) => {
    const key = `${item.MovieTitle}_${item.LocationName}`;
    return userRecords[key]?.visitHistory && userRecords[key].visitHistory!.length > 0;
  });

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', position: 'relative' }}>
      {/* 상단 검색바 & 버튼 영역 */}
      <div style={{
        position: 'absolute',
        top: '55px',        // 👈 기존 '15px'에서 아래로 넉넉하게 내려서 지도 버튼과 분리합니다!
        left: '15px',       // 👈 좌측 여백도 자연스럽게 맞춥니다
        zIndex: 10,
        display: 'flex',
        gap: '8px',
        width: 'calc(100% - 90px)', // 👈 우측 지도/위성 버튼 영역(약 90px)만큼 너비를 줄여서 절대 안 겹치게 방어합니다!
        maxWidth: '320px',
        boxSizing: 'border-box'
      }}>
        <div style={{
          background: 'white',
          padding: '8px 14px',
          borderRadius: '24px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          display: 'flex',
          alignItems: 'center',
          flex: 1,
          boxSizing: 'border-box'
        }}>
          <input
            type="text"
            placeholder="🎬 영화/촬영지 검색"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if (e.target.value) setSelectedMovie('');
            }}
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              fontSize: '13px',
              fontFamily: 'sans-serif',
              background: 'transparent'
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#888', padding: '0 4px' }}
            >
              ✕
            </button>
          )}
        </div>

        {/* 내 저장 목록(마이페이지) 버튼 */}
        <button
          onClick={() => setIsDrawerOpen(true)}
          style={{
            background: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '42px',
            height: '42px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            flexShrink: '0',
            position: 'relative'
          }}
          title="내 목록 보기"
        >
          📂
          {(likedItems.length > 0 || visitedItems.length > 0) && (
            <span style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              width: '8px',
              height: '8px',
              background: '#e53935',
              borderRadius: '50%'
            }} />
          )}
        </button>

        {/* 내 위치 이동 버튼 */}
        <button
          onClick={handlePanToCurrentLocation}
          style={{
            background: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '42px',
            height: '42px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            flexShrink: '0'
          }}
          title="내 위치로 이동"
        >
          🧭
        </button>
      </div>

      {/* 리액트 기반 커스텀 팝업창 */}
      {activePopupItem && (
        <div style={{
          position: 'absolute',
          top: '75px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          padding: '14px',
          width: '260px',
          maxHeight: '65vh',
          overflowY: 'auto',
          fontFamily: 'sans-serif',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', color: '#1a73e8' }}>[{activePopupItem.MovieTitle}]</h3>
            <button
              onClick={() => setActivePopupItem(null)}
              style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#888', padding: '0' }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#333' }}>📍 {activePopupItem.LocationName}</p>
            <button
              onClick={() => toggleLike(activeRecordKey)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', padding: 0 }}
              title="찜하기"
            >
              {activeRecord.isLiked ? '❤️' : '🤍'}
            </button>
          </div>

          {activePopupItem.SceneImageUrl && (
            <img
              src={activePopupItem.SceneImageUrl}
              alt={activePopupItem.LocationName}
              style={{ width: '100%', height: '120px', borderRadius: '6px', marginBottom: '8px', objectFit: 'cover' }}
            />
          )}

          {activePopupItem.Description && (
            <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666', lineHeight: '1.4' }}>
              {activePopupItem.Description}
            </p>
          )}

          {/* 성지순례 체크인 영역 */}
          <div style={{ background: '#f8f9fa', padding: '8px', borderRadius: '6px', marginBottom: '8px', border: '1px solid #eee' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: activeRecord.visitHistory && activeRecord.visitHistory.length > 0 ? '6px' : '0' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#555' }}>
                성지순례 체크인 ({activeRecord.visitHistory ? activeRecord.visitHistory.length : 0}회)
              </span>
              <button
                onClick={() => addVisit(activeRecordKey)}
                style={{ background: '#34a853', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                + 체크인 기록
              </button>
            </div>

            {activeRecord.visitHistory && activeRecord.visitHistory.length > 0 && (
              <div style={{ maxHeight: '90px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {activeRecord.visitHistory.map((timeStr, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '3px 6px', borderRadius: '4px', border: '1px solid #e0e0e0', fontSize: '10px' }}>
                    <span style={{ color: '#137333' }}>⏱️ {timeStr}</span>
                    <button
                      onClick={() => removeVisit(activeRecordKey, idx)}
                      style={{ background: 'none', border: 'none', color: '#c5221f', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', padding: '0 4px' }}
                      title="기록 삭제"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {activePopupItem.YoutubeUrl && (
            <a href={activePopupItem.YoutubeUrl} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#1a73e8', fontWeight: 'bold', textDecoration: 'none' }}>
              ▶ 유튜브 영상에서 보기
            </a>
          )}
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${activePopupItem.lat},${activePopupItem.lng}`} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: '12px', color: '#34a853', fontWeight: 'bold', textDecoration: 'none' }}>
            🚗 현재 위치에서 길찾기
          </a>
        </div>
      )}

      {/* 마이페이지 / 내 서랍 모달 */}
      {isDrawerOpen && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,0.5)',
          zIndex: 30,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: 'sans-serif'
        }}>
          <div style={{
            background: 'white',
            width: '90%',
            maxWidth: '340px',
            maxHeight: '75vh',
            borderRadius: '16px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h2 style={{ margin: 0, fontSize: '17px', color: '#202124' }}>📂 내 성지순례 서랍</h2>
              <button
                onClick={() => setIsDrawerOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#666' }}
              >
                ✕
              </button>
            </div>

            {/* 탭 헤더 */}
            <div style={{ display: 'flex', borderBottom: '1px solid #eee', marginBottom: '12px' }}>
              <button
                onClick={() => setDrawerTab('liked')}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  border: 'none',
                  background: 'none',
                  borderBottom: drawerTab === 'liked' ? '2px solid #e53935' : 'none',
                  color: drawerTab === 'liked' ? '#e53935' : '#777',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                ❤️ 찜한 장소 ({likedItems.length})
              </button>
              <button
                onClick={() => setDrawerTab('visited')}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  border: 'none',
                  background: 'none',
                  borderBottom: drawerTab === 'visited' ? '2px solid #34a853' : 'none',
                  color: drawerTab === 'visited' ? '#34a853' : '#777',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                ✅ 체크인 목록 ({visitedItems.length})
              </button>
            </div>

            {/* 탭 콘텐츠 */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {drawerTab === 'liked' && (
                likedItems.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#999', textAlign: 'center', padding: '20px 0' }}>
                    아직 찜한 장소가 없습니다. 🤍를 눌러 장소를 보관해 보세요!
                  </p>
                ) : (
                  likedItems.map((item) => (
                    <div
                      key={`${item.MovieTitle}_${item.LocationName}`}
                      onClick={() => handleSelectLocationFromDrawer(item)}
                      style={{
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid #eee',
                        background: '#fcfcfc',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                      }}
                    >
                      {item.PosterUrl ? (
                        <img src={item.PosterUrl} alt={item.MovieTitle} style={{ width: '40px', height: '55px', objectFit: 'cover', borderRadius: '4px' }} />
                      ) : (
                        <div style={{ width: '40px', height: '55px', background: '#eee', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>🎬</div>
                      )}
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '11px', color: '#1a73e8', fontWeight: 'bold' }}>{item.MovieTitle}</div>
                        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📍 {item.LocationName}</div>
                      </div>
                      <span style={{ fontSize: '16px' }}>❤️</span>
                    </div>
                  ))
                )
              )}

              {drawerTab === 'visited' && (
                visitedItems.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#999', textAlign: 'center', padding: '20px 0' }}>
                    아직 체크인한 장소가 없습니다. 현장에 방문해서 체크인을 남겨보세요!
                  </p>
                ) : (
                  visitedItems.map((item) => {
                    const key = `${item.MovieTitle}_${item.LocationName}`;
                    const history = userRecords[key]?.visitHistory || [];
                    const lastVisit = history[history.length - 1] || '';
                    return (
                      <div
                        key={key}
                        onClick={() => handleSelectLocationFromDrawer(item)}
                        style={{
                          padding: '10px',
                          borderRadius: '8px',
                          border: '1px solid #eee',
                          background: '#fcfcfc',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px'
                        }}
                      >
                        {item.PosterUrl ? (
                          <img src={item.PosterUrl} alt={item.MovieTitle} style={{ width: '40px', height: '55px', objectFit: 'cover', borderRadius: '4px' }} />
                        ) : (
                          <div style={{ width: '40px', height: '55px', background: '#eee', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>🎬</div>
                        )}
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontSize: '11px', color: '#34a853', fontWeight: 'bold' }}>{item.MovieTitle} (총 {history.length}회 방문)</div>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📍 {item.LocationName}</div>
                          <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>최근: {lastVisit}</div>
                        </div>
                        <span style={{ fontSize: '16px' }}>✅</span>
                      </div>
                    );
                  })
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* 하단 세로 비율 고정 포스터 카드 목록 */}
      <div style={{
        position: 'absolute',
        bottom: '65px',
        left: '0',
        right: '0',
        zIndex: 10,
        display: 'flex',
        gap: '10px',
        overflowX: 'auto',
        padding: '10px 16px',
        boxSizing: 'border-box',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none'
      }}>
        <div
          onClick={() => { setSelectedMovie(''); setSearchTerm(''); setActivePopupItem(null); }}
          style={{
            flex: '0 0 80px',
            height: '118px',
            background: selectedMovie === '' && !searchTerm ? '#1a73e8' : 'white',
            color: selectedMovie === '' && !searchTerm ? 'white' : '#333',
            borderRadius: '10px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 'bold',
            transition: 'all 0.2s',
            border: selectedMovie === '' && !searchTerm ? '2px solid #1a73e8' : '1px solid #ddd',
            flexShrink: 0
          }}
        >
          <span style={{ fontSize: '22px', marginBottom: '4px' }}>🗺️</span>
          전체 보기
        </div>

        {uniqueMovies.map((item) => {
          const isSelected = selectedMovie === item.MovieTitle;
          return (
            <div
              key={item.MovieTitle}
              onClick={() => {
                setSelectedMovie(isSelected ? '' : item.MovieTitle);
                setSearchTerm('');
                setActivePopupItem(null);
              }}
              style={{
                flex: '0 0 80px',
                height: '118px',
                background: 'white',
                borderRadius: '10px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                cursor: 'pointer',
                overflow: 'hidden',
                position: 'relative',
                border: isSelected ? '3px solid #1a73e8' : '1px solid rgba(0,0,0,0.1)',
                transition: 'all 0.2s',
                transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                flexShrink: 0
              }}
            >
              {item.PosterUrl ? (
                <img
                  src={item.PosterUrl}
                  alt={item.MovieTitle}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                />
              ) : (
                <div style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#f1f3f4',
                  color: '#333',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  padding: '4px',
                  boxSizing: 'border-box'
                }}>
                  {item.MovieTitle}
                </div>
              )}
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                color: 'white',
                fontSize: '11px',
                fontWeight: 'bold',
                padding: '6px 4px 4px 4px',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {item.MovieTitle}
              </div>
            </div>
          );
        })}
      </div>

      {/* 하단 고정 카카오 애드핏 배너 광고 영역 */}
      <div
        ref={adRef}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '55px',
          background: '#ffffff',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 25,
          boxShadow: '0 -2px 10px rgba(0,0,0,0.1)'
        }}
      />

      {/* 지도 영역 */}
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}