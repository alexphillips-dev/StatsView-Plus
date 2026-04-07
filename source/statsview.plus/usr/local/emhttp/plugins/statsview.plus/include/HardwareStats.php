<?PHP
/* StatsView Plus
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License version 2,
 * as published by the Free Software Foundation.
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 */
?>
<?
$plugin = 'statsview.plus';
$docroot = $docroot ?? $_SERVER['DOCUMENT_ROOT'] ?: '/usr/local/emhttp';

// add translations
$_SERVER['REQUEST_URI'] = 'stats';
require_once "$docroot/webGui/include/Translations.php";
require_once "$docroot/webGui/include/Helpers.php";

function bar_color($val) {
  global $display;
  $critical = $display['critical']??0;
  $warning = $display['warning']??0;
  if ($val>=$critical && $critical>0) return "redbar";
  if ($val>=$warning && $warning>0) return "orangebar";
  return "greenbar";
}

function statsview_plus_threshold_state($percent, $warning, $critical, $normal_mode=true) {
  if (!$normal_mode) {
    return ['tone'=>'maintenance', 'label'=>_('Maintenance')];
  }
  if ($critical>0 && $percent>=$critical) {
    return ['tone'=>'critical', 'label'=>_('Critical')];
  }
  if ($warning>0 && ($critical==0 || $warning<$critical) && $percent>=$warning) {
    return ['tone'=>'warning', 'label'=>_('Warning')];
  }
  return ['tone'=>'normal', 'label'=>_('Normal')];
}

function statsview_plus_format_bytes($bytes, $unit) {
  return my_scale($bytes, $unit, null, -1).' '.$unit;
}

function statsview_plus_disk_dashboard_payload($start_mode, $pools_csv) {
  $normal_mode = $start_mode=='Normal';
  $pools = array_values(array_filter(array_map('trim', explode(',', $pools_csv))));
  if (empty($pools)) {
    $pools = ['cache'];
  }

  $disks = (array)parse_ini_file("state/disks.ini", true);
  $var = [];
  require_once 'webGui/include/CustomMerge.php';
  extract(parse_plugin_cfg("dynamix", true));

  $rows = [];
  $parity = 0;
  $arraysize = 0;
  $arrayfree = 0;
  $data_count = 0;
  $pool_count = 0;
  $flash_count = 0;

  foreach ($disks as $disk) {
    $type = $disk['type']??'';
    $status = $disk['status']??'';
    $mounted = ($disk['fsStatus']??'')=='Mounted';

    if ((!$mounted && $type!='Parity') || strpos($status, '_NP')!==false) {
      continue;
    }

    if ($type=='Parity') {
      $parity = max($parity, ($disk['size']??0)*1024);
      continue;
    }

    $name = $disk['name']??'';
    $size_bytes = 0;
    $free_bytes = 0;
    $label = '';
    $type_key = '';
    $type_label = '';

    switch ($type) {
    case 'Data':
      $size_bytes = ($disk['size']??0)*1024;
      $free_bytes = ($disk['fsFree']??0)*1024;
      $label = _(my_disk($name), 3);
      $type_key = 'data';
      $type_label = _('Data');
      $arraysize += $size_bytes;
      $arrayfree += $free_bytes;
      $data_count++;
      break;
    case 'Flash':
      $size_bytes = ($disk['size']??0)*1024;
      $free_bytes = ($disk['fsFree']??0)*1024;
      $label = _(my_disk($name), 3);
      $type_key = 'flash';
      $type_label = _('Flash');
      $flash_count++;
      break;
    case 'Cache':
      if (!in_array($name, $pools, true)) {
        break;
      }
      $size_bytes = (isset($disk['fsSize']) ? $disk['fsSize'] : ($disk['size']??0))*1024;
      $free_bytes = ($disk['fsFree']??0)*1024;
      $label = ucfirst($name);
      $type_key = 'pool';
      $type_label = _('Pool');
      $pool_count++;
      break;
    }

    if ($size_bytes<=0) {
      continue;
    }

    $used_bytes = max(0, $size_bytes-$free_bytes);
    $free_percent = $normal_mode ? round(100*$free_bytes/$size_bytes) : 100;
    $used_percent = max(0, 100-$free_percent);
    $critical = (int)(!empty($disk['critical']) ? $disk['critical'] : ($display['critical']??0));
    $warning = (int)(!empty($disk['warning']) ? $disk['warning'] : ($display['warning']??0));
    $state = statsview_plus_threshold_state($used_percent, $warning, $critical, $normal_mode);

    $rows[] = [
      'key' => $name,
      'name' => $name,
      'label' => $label,
      'type' => $type_key,
      'typeLabel' => $type_label,
      'sizeBytes' => $size_bytes,
      'sizeLabel' => statsview_plus_format_bytes($size_bytes, $unit),
      'usedBytes' => $used_bytes,
      'usedLabel' => statsview_plus_format_bytes($used_bytes, $unit),
      'freeBytes' => $free_bytes,
      'freeLabel' => statsview_plus_format_bytes($free_bytes, $unit),
      'usedPercent' => $used_percent,
      'freePercent' => $free_percent,
      'warningThreshold' => $warning,
      'criticalThreshold' => $critical,
      'state' => $state['tone'],
      'stateLabel' => $state['label']
    ];
  }

  $type_order = ['data'=>0, 'pool'=>1, 'flash'=>2];
  usort($rows, function($left, $right) use ($type_order) {
    $left_order = $type_order[$left['type']] ?? 99;
    $right_order = $type_order[$right['type']] ?? 99;
    if ($left_order!=$right_order) {
      return $left_order<=>$right_order;
    }
    return strnatcasecmp($left['label'], $right['label']);
  });

  $arrayused = max(0, $arraysize-$arrayfree);
  $freepercent = $arraysize>0 ? ($normal_mode ? round(100*$arrayfree/$arraysize) : 100) : 0;
  $arraypercent = $arraysize>0 ? max(0, 100-$freepercent) : 0;
  $summary_state = statsview_plus_threshold_state($arraypercent, (int)($display['warning']??0), (int)($display['critical']??0), $normal_mode);

  return [
    'generatedAt' => time(),
    'mode' => $normal_mode ? 'normal' : 'maintenance',
    'modeLabel' => $normal_mode ? _('Normal') : _('Maintenance'),
    'summary' => [
      'arraySizeBytes' => $arraysize,
      'arraySizeLabel' => statsview_plus_format_bytes($arraysize, $unit),
      'arrayUsedBytes' => $arrayused,
      'arrayUsedLabel' => statsview_plus_format_bytes($arrayused, $unit),
      'arrayFreeBytes' => $arrayfree,
      'arrayFreeLabel' => statsview_plus_format_bytes($arrayfree, $unit),
      'parityBytes' => $parity,
      'parityLabel' => statsview_plus_format_bytes($parity, $unit),
      'arrayPercent' => $arraypercent,
      'freePercent' => $freepercent,
      'warningThreshold' => (int)($display['warning']??0),
      'criticalThreshold' => (int)($display['critical']??0),
      'state' => $summary_state['tone'],
      'stateLabel' => $summary_state['label'],
      'diskCount' => count($rows),
      'dataDiskCount' => $data_count,
      'poolCount' => $pool_count,
      'flashCount' => $flash_count
    ],
    'rows' => $rows
  ];
}

switch ($_POST['cmd']??'') {
case 'disk_dashboard':
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(
    statsview_plus_disk_dashboard_payload($_POST['startMode']??'', $_POST['pools']??''),
    JSON_UNESCAPED_SLASHES
  );
  exit;
case 'sum':
  $plugin = $_POST['plugin']??'';
  $normal = ($_POST['startMode']??'')=='Normal';
  $disks = (array)parse_ini_file("state/disks.ini",true);
  extract(parse_plugin_cfg('dynamix',true));
  $arraysize = $arrayfree = 0;
  foreach ($disks as $disk) {
    if ($disk['type']!='Data') continue;
    $arraysize += $disk['size']*1024;
    $arrayfree += $disk['fsFree']*1024;
  }
  $arrayused = $arraysize-$arrayfree;
  $freepercent = $normal ? round(100*$arrayfree/$arraysize) : 100;
  $arraypercent = 100-$freepercent;
  $data = [];
  $data[] = "mybar ".bar_color($arraypercent)." align-left";
  $data[] = "$arraypercent%";
  $data[] = "mybar ".bar_color($arraypercent)." inside";
  $data[] = "<strong>".my_scale($arrayused,$unit,null,-1)." $unit <img src='/plugins/$plugin/images/arrow.png' style='margin-top:-3px'> $arraypercent%</strong><br><small>"._('Total Space Used')."</small>";
  $data[] = "<strong>".my_scale($arrayfree,$unit,null,-1)." $unit <img src='/plugins/$plugin/images/arrow.png' style='margin-top:-3px'> $freepercent%</strong><br><small>"._('Available for Data')."</small>";
  echo implode(';',$data);
  exit;
case 'sys':
  $normal = ($_POST['startMode']??'')=='Normal';
  $pools = explode(',',$_POST['pools']??'');
  $series = $normal ? ['Critical','Warning','Normal'] : ['Critical','Warning','Normal','Maintenance'];
  $disks = (array)parse_ini_file("state/disks.ini", true); $var = [];
  require_once 'webGui/include/CustomMerge.php';
  extract(parse_plugin_cfg("dynamix",true));
  $output = [];
  $json = [];
  foreach ($disks as $disk) {
    $size = 0;
    if (($disk['fsStatus']??'')!='Mounted' && $disk['type']!='Parity') continue;
    switch ($disk['type']) {
    case 'Data':
    case 'Flash':
      $size = $disk['size'];
    break;
    case 'Cache':
      if (in_array($disk['name'],$pools)) $size = isset($disk['fsSize']) ? $disk['fsSize'] : $disk['size'];
    break;}
    if ($size>0) {
      if ($normal) {
        $free = $disk['fsFree'];
        $percent = 100-round(100*$free/$size);
        $critical = !empty($disk['critical']) ? $disk['critical'] : $display['critical'] ?? 0;
        $warning = !empty($disk['warning']) ? $disk['warning'] : $display['warning'] ?? 0;
        $point[0] = $critical>0 ? $percent-$critical : 0;
        $point[1] = $warning>0 ? $percent-$warning : 0;
        if ($point[0]>0) {$point[1] = $warning>0 ? $critical-$warning : 0;} else {$point[0] = 0;}
        if ($point[1]>0) {$point[2] = $warning;} else {$point[2] = $warning>0 ? $percent : $percent-$point[0]; $point[1] = 0;}
        if ($warning>=$critical && $critical>0 && $point[2]>$warning) $point[2] = $critical;
      } else {
        $point[0] = 0;
        $point[1] = 0;
        $point[2] = 0;
        $point[3] = 100;
      }
      $i = 0;
      foreach ($series as $label) $output[$label][] = $point[$i++];
    }
  }
  foreach ($series as $label) $json[] = '"'.$label.'":['.implode(',', $output[$label]).']';
  echo '{'.implode(',', $json).'}';
  exit;
case 'rts':
  $nl  = '"\n"';
  $cpu = '$2=="all"';
  $hdd = '$2=="tps"';
  $ram = '$2=="kbmemfree"';
  $com = '$2=="'.($_POST['port']??'').'"';
  exec("sar 1 1 -u -b -r -n DEV|grep -a '^A'|tr -d '\\0'|awk '$cpu {u=$3;n=$4;s=$5;}; $hdd {getline;r=$6;w=$7;}; $ram {getline;f=$2;c=$6+$7;d=$4;}; $com {x=$5;y=$6;} END{print u,n,s{$nl}r,w{$nl}f,c,d{$nl}x,y}'",$data);
  echo implode(' ', $data);
  exit;
case 'cpu':
  $series = ['User','Nice','System'];
  $data = '$5,$6,$7';
  $case = '';
  $mask = ' && $5<=100 && $6<=100 && $7<=100';
  break;
case 'ram':
  $series = ['Free','Cached','Used'];
  $data = '$4,$8+$9,$6';
  $case = '-- -r';
  $mask = ' && $4<100000000000 && $6<100000000000 && $8<100000000000 && $9<100000000000';
  break;
case 'com':
  $series = ['Receive','Transmit'];
  $data = '$7,$8';
  $case = '-- -n DEV';
  $mask = ' && $4=="'.($_POST['port']??'').'" && $7<100000000000 && $8<100000000000';
  break;
case 'hdd':
  $series = ['Read','Write'];
  $data = '$8,$9';
  $case = '-- -b';
  $mask = ' && $8<100000000000 && $9<100000000000';
  break;
}
$input = [];
$output = [];
$json = [];
$select = [1=>60, 2=>120, 3=>300, 7=>600, 14=>1200, 21=>1800, 31=>3600, 3653=>7200];
$logs = glob('/var/sa/sa*',GLOB_NOSORT);
$days = count($logs);
$graph = $_POST['graph']??0;
if ($graph>0) {
  $interval = $select[$graph];
  if ($days<=28) {
    foreach ($select as $index => $period) {
      if ($index>$days) break;
      $interval = $period;
      if ($index==$graph) break;
    }
  }
  $valid = '$2~/^[0-9]/ && $3>='.((floor(time()/86400)-$graph)*86400).$mask;
  usort($logs, function($a,$b){return filemtime($a)-filemtime($b);});
  foreach ($logs as $log) {
    if ($days<=$graph) exec("sadf -d -U $interval $log $case|awk -F';' '$valid {print $3,$data}'",$input);
    $days--;
  }
  sort($input);
  foreach ($input as $row) {
    $field = explode(' ', $row);
    $timestamp = $field[0]*1000;
    $i = 1;
    foreach ($series as $label) $output[$label][] = "[$timestamp,{$field[$i++]}]";
  }
}
if (empty($output)) foreach ($series as $label) $output[$label][] = "";
foreach ($series as $label) $json[] = '"'.$label.'":['.implode(',', $output[$label]).']';
echo '{'.implode(',', $json).'}';
?>
